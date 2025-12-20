import { CronJob, AsyncTask } from "toad-scheduler";
import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import { z } from "zod/v3";
import { zodResponseFormat } from "openai/helpers/zod";

// Run every day at 00:01
const CRON_EXPRESSION = "1 0 * * *";
const EXCLUDED_APPS = ["loginwindow", "dock"];

const OPENAI_ACTIVITY_MODEL =
  process.env.OPENAI_ACTIVITY_SUMMARY_MODEL || "gpt-5-mini";

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

const activitySummaryResponseSchema = z.object({
  dailyInsights: z
    .array(z.string())
    .min(5)
    .max(10)
    .describe(
      "Conversational summary of yesterday's accomplishments and work patterns"
    ),
  improvementPlan: z
    .array(z.string())
    .min(5)
    .max(10)
    .describe("Friendly, actionable tips to boost productivity today"),
});

const ACTIVITY_SUMMARY_SYSTEM_PROMPT = `You are a friendly productivity coach helping users understand their work patterns.

Generate natural, conversational insights that feel personal and human:

1. **Daily Insights**: 5-10 clear statements about what the user accomplished yesterday. Write in a warm, encouraging tone as if you're a supportive colleague. Focus on achievements and patterns, not just raw data.

2. **Improvement Plan**: 5-10 practical, actionable suggestions for today. Be specific and constructive, focusing on one clear action per suggestion.

**TONE GUIDELINES**:
- Write naturally, as if speaking directly to the user
- Start insights with action verbs or engaging phrases ("Spent quality time on...", "Focused deeply on...", "Made progress with...")
- For improvements, use encouraging language ("Try blocking...", "Consider reducing...", "Focus on...")
- Avoid technical jargon, keep it conversational and relatable
- Be positive and motivating, even when suggesting improvements

**FORMATTING**:
- Each line item must be 15 words or less
- Be specific with app names and activities when possible
- Use timestamps only when highlighting important patterns
- Avoid redundant information or filler words

Be encouraging, specific, and human.`;

interface TopActivityResponse {
  app: string;
  title: string;
  duration: number;
  tag: string;
  mergedTimestamp?: string;
}

function convertToIST(utcDateString: string): string {
  try {
    const date = new Date(utcDateString);
    return date.toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return utcDateString;
  }
}

function formatActivitiesForPrompt(activities: TopActivityResponse[]): string {
  const totalDuration = activities.reduce(
    (sum, activity) => sum + (activity.duration || 0),
    0
  );

  return activities
    .map((activity, index) => {
      const durationMinutes = Math.round((activity.duration || 0) / 60);
      const durationHours =
        Math.round(((activity.duration || 0) / 3600) * 10) / 10;
      const percentage = Math.round(
        ((activity.duration || 0) / totalDuration) * 100
      );
      const tag = activity.tag ? `[${activity.tag}]` : "[Untagged]";

      let timestamps = "";
      if (activity.mergedTimestamp) {
        const parts = activity.mergedTimestamp
          .split(",")
          .filter((p) => p.trim().length > 0);
        // Limit to first 20 timestamps to avoid token limit issues if there are too many
        const limitedParts = parts.slice(0, 20);
        const formattedParts = limitedParts
          .map((part) => {
            const [ts, dur] = part.split("|");
            if (!ts) return "";
            return `${convertToIST(ts)} (${dur}s)`;
          })
          .filter(Boolean);

        timestamps = `\n   Timestamps (IST): ${formattedParts.join(", ")}${
          parts.length > 20 ? "..." : ""
        }`;
      }

      return `${index + 1}. ${activity.app} → "${activity.title}" ${tag}
   Duration: ${durationHours}h (${durationMinutes}min) | ${percentage}% of time${timestamps}`;
    })
    .join("\n\n");
}

async function getTopActivities(
  profileId: string,
  query: {
    startDate?: string;
    endDate?: string;
  },
  prisma: PrismaClient
): Promise<TopActivityResponse[]> {
  const { startDate, endDate } = query;

  const topActivities = await prisma.activity.groupBy({
    by: ["app", "title", "autoTags", "mergedTimestamp"],
    where: {
      profileId,
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
      app: { notIn: EXCLUDED_APPS },
    },
    _sum: { duration: true },
    orderBy: { _sum: { duration: "desc" } },
    take: 100, // Increased to get more context
  });

  return topActivities.map((item) => ({
    app: item.app,
    title: item.title,
    duration: item._sum?.duration || 0,
    tag: item.autoTags || "",
    mergedTimestamp: item.mergedTimestamp || undefined,
  }));
}

/**
 * Generate insights for a specific user for a given date range
 */
async function generateUserInsights(
  profileId: string,
  startDate: string,
  endDate: string,
  prisma: PrismaClient
) {
  const activities = await getTopActivities(
    profileId,
    {
      startDate,
      endDate,
    },
    prisma
  );

  if (!activities || activities.length === 0) {
    return {
      dailyInsights: ["No activities recorded for yesterday."],
      improvementPlan: [
        "Ensure your activity tracker is running to get insights.",
      ],
    };
  }

  if (!openaiClient) {
    throw new Error("OpenAI client is not configured");
  }

  const totalDuration = activities.reduce(
    (sum, activity) => sum + (activity.duration || 0),
    0
  );

  const userPrompt = `ACTIVITY ANALYSIS DATA:
Date range: ${startDate} -> ${endDate}
Total duration tracked: ${Math.round(totalDuration / 60)} minutes

TOP ACTIVITIES (by duration):
${formatActivitiesForPrompt(activities)}

ANALYSIS REQUIREMENTS:
Based on the activities above, generate the requested insights and improvement plan.
REMINDER: The provided timestamps are in IST. Use them as is.`;

  try {
    const completion = await openaiClient.chat.completions.parse({
      model: OPENAI_ACTIVITY_MODEL,
      messages: [
        {
          role: "system",
          content: ACTIVITY_SUMMARY_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      response_format: zodResponseFormat(
        activitySummaryResponseSchema,
        "activity_summary"
      ),
    });

    const parsed = completion.choices?.[0]?.message?.parsed;

    return {
      dailyInsights: parsed?.dailyInsights || [],
      improvementPlan: parsed?.improvementPlan || [],
    };
  } catch (error) {
    console.error("Failed to generate activity summary via OpenAI:", error);
    return {
      dailyInsights: ["Error generating insights."],
      improvementPlan: [],
    };
  }
}

export async function executeDailyInsightsTask(
  fastify: FastifyInstance
): Promise<void> {
  console.log("Starting daily insights task");

  try {
    // Get all profiles
    const profiles = await fastify.prisma.profile.findMany();
    console.log(`Found ${profiles.length} profiles to process`);

    // Calculate yesterday's date range
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    // Set to start of day (00:00:00)
    yesterday.setHours(0, 0, 0, 0);
    const startDate = yesterday.toISOString();

    // Set to end of day (23:59:59.999)
    const endOfYesterday = new Date(yesterday);
    endOfYesterday.setHours(23, 59, 59, 999);
    const endDate = endOfYesterday.toISOString();

    console.log(`Generating insights for period: ${startDate} to ${endDate}`);

    for (const profile of profiles) {
      try {
        console.log(`Processing profile ${profile.id}`);

        const summary = await generateUserInsights(
          profile.id,
          startDate,
          endDate,
          fastify.prisma
        );

        // Only save to database if insights were successfully generated
        if (
          summary.dailyInsights.length > 0 &&
          !summary.dailyInsights.includes(
            "No activities recorded for yesterday."
          ) &&
          !summary.dailyInsights.includes("Error generating insights.")
        ) {
          // Normalize the date to remove time component for unique constraint matching
          const normalizedDate = new Date(startDate);
          normalizedDate.setHours(0, 0, 0, 0);

          // Set end of day for date range query
          const endOfNormalizedDate = new Date(normalizedDate);
          endOfNormalizedDate.setHours(23, 59, 59, 999);

          // Check if insight already exists for this date
          const existingInsight = await fastify.prisma.dailyInsight.findFirst({
            where: {
              profileId: profile.id,
              date: {
                gte: normalizedDate,
                lte: endOfNormalizedDate,
              },
            },
          });

          // Update or create the insight
          if (existingInsight) {
            await fastify.prisma.dailyInsight.update({
              where: {
                id: existingInsight.id,
              },
              data: {
                dailyInsights: summary.dailyInsights,
                improvementPlan: summary.improvementPlan,
              },
            });
          } else {
            await fastify.prisma.dailyInsight.create({
              data: {
                profileId: profile.id,
                dailyInsights: summary.dailyInsights,
                improvementPlan: summary.improvementPlan,
                date: normalizedDate,
              },
            });
          }
        }
      } catch (err) {
        console.error(`Error processing profile ${profile.id}:`, err);
        // Continue with next profile
      }
    }

    console.log("Daily insights task completed");
  } catch (error) {
    console.error("Error in daily insights task:", error);
    throw error;
  }
}

export const createDailyInsightsJob = (fastify: FastifyInstance) => {
  const taskFunction = () => executeDailyInsightsTask(fastify);

  // Run immediately
  taskFunction().catch((err) => {
    console.error("Immediate daily insights task error:", err);
  });

  const task = new AsyncTask(
    "daily insights task",
    taskFunction,
    (err: Error) => {
      console.error("Daily insights task error:", err);
    }
  );

  return new CronJob({ cronExpression: CRON_EXPRESSION }, task);
};

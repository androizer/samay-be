import { CronJob, AsyncTask } from "toad-scheduler";
import { FastifyInstance } from "fastify";
import { Activity } from "@prisma/client";

// Interface for the aggregated result
interface AggregatedActivity {
  profileId: string;
  app: string;
  title: string;
  selected: boolean;
  duration: number;
  timestamp: string;
  url: string;
  merged: boolean;
  projectId: number | null;
  mergedTimestamp: string;
  autoTags: string;
  isAutoTagged: boolean;

}

// Helper function to convert timestamp to IST date string (YYYY-MM-DD)
const getISTDate = (timestamp: string): string => {
  if (!timestamp) return "";
  try {
    const date = new Date(timestamp);
    // Convert to IST (Asia/Kolkata timezone)
    const istDateString = date.toLocaleString("en-US", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    // Format: MM/DD/YYYY -> YYYY-MM-DD
    const [month, day, year] = istDateString.split("/");
    return `${year}-${month}-${day}`;
  } catch {
    return "";
  }
};

const mergeActivities = (
  activities: Partial<Activity>[]
): { activities: AggregatedActivity[]; allIds: string[] } => {
  // Group by userId, app, title, selected and aggregate duration
  const groupedData: Record<string, AggregatedActivity> = {};
  const allIds: string[] = [];
  activities.forEach((activity) => {
    const {
      profileId = "",
      app = "",
      title = "",
      selected = false,
      duration = 0,
      id = "",
      timestamp = "",
      url = "",
      projectId = null,
      autoTags = "",
      isAutoTagged = false,

    } = activity;

    if (!profileId || !app || !title) {
      return { activities: [], allIds: [] };
    }

    const istDate = getISTDate(timestamp);
    const key = `${profileId}|${app}|${title}|${selected}|${istDate}`;
    allIds.push(id);

    const mergedTimestamp =
      timestamp && duration ? `${timestamp}|${duration}` : "";

    if (groupedData[key]) {
      // Add duration to existing group
      groupedData[key].duration += duration || 0;
      groupedData[key].url += url ? `,${url}` : "";
      groupedData[key].mergedTimestamp += mergedTimestamp
        ? `,${mergedTimestamp}`
        : "";
      groupedData[key].autoTags = groupedData[key].autoTags || autoTags || "";
      groupedData[key].isAutoTagged =
        groupedData[key].isAutoTagged || isAutoTagged || false;
    } else {
      // Create new group
      groupedData[key] = {
        profileId,
        app,
        title,
        selected,
        duration: duration || 0,
        timestamp,
        url: url ? `${url}` : "",
        merged: true,
        projectId,
        mergedTimestamp: mergedTimestamp || "",
        autoTags: autoTags || "",
        isAutoTagged,

      };
    }
  });

  // Convert grouped data to array
  return { activities: Object.values(groupedData), allIds };
};

export const createEventsMergeJob = (fastify: FastifyInstance) => {
  const taskFunction = async () => {
    console.log("Starting events merge task");

    try {
      const activities = await fastify.prisma.activity.findMany({
        where: {
          merged: false,
        },
        select: {
          id: true,
          profileId: true,
          app: true,
          title: true,
          selected: true,
          timestamp: true,
          duration: true,
          projectId: true,
          autoTags: true,
          isAutoTagged: true,

        },
      });

      const { activities: result, allIds } = mergeActivities(activities);
      // create result activities in db with merged true and remove allids from db do these in transaction
      // Process in batches to avoid issues with large datasets
      const BATCH_SIZE = 500; // Smaller batch size to avoid transaction timeouts

      // Use interactive transaction with extended timeout for large operations
      await fastify.prisma.$transaction(
        async (tx) => {
          // Create activities in batches
          for (let i = 0; i < result.length; i += BATCH_SIZE) {
            const batch = result.slice(i, i + BATCH_SIZE);
            await tx.activity.createMany({
              data: batch,
            });
          }

          // Delete activities in batches
          for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
            const batch = allIds.slice(i, i + BATCH_SIZE);
            await tx.activity.deleteMany({ where: { id: { in: batch } } });
          }
        },
        {
          maxWait: 30000, // Maximum time to wait for a transaction slot (30 seconds)
          timeout: 600000, // Maximum time the transaction can run (10 minutes)
        }
      );
    } catch (error) {
      console.error("Error in events merge task:", error);
      throw error;
    }
  };

  const task = new AsyncTask(
    "events merge task",
    taskFunction,
    (err: Error) => {
      console.error("Events merge task error:", err);
    }
  );

  return new CronJob({ cronExpression: "0 0 * * *" }, task);
};

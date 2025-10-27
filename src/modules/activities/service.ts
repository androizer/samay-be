import { Activity, PrismaClient, Project, Prisma } from "@prisma/client";
import {
  ActivityResponse,
  CreateActivityInput,
  UpdateActivityInput,
  TopActivityResponse,
} from "./types";

const EXCLUDED_APPS = ["loginwindow", "dock"];

/**
 * Sanitize string data by removing null bytes and other invalid UTF-8 characters
 */
function sanitizeString(str: string): string {
  if (!str) return str;

  // Remove null bytes and other control characters that can cause UTF-8 issues
  return str
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      // Keep printable characters and common whitespace (space, tab, newline, carriage return)
      return code >= 32 || code === 9 || code === 10 || code === 13;
    })
    .join("")
    .trim(); // Remove leading/trailing whitespace
}

/**
 * Sanitize activity data to prevent database insertion errors
 */
function sanitizeActivityData(activity: {
  app?: string;
  url?: string;
  title?: string;
}) {
  return {
    ...activity,
    app: sanitizeString(activity.app || ""),
    url: sanitizeString(activity.url || ""),
    title: sanitizeString(activity.title || ""),
  };
}

/**
 * Create a new activity
 */
export async function createActivity(
  activities: CreateActivityInput[],
  userId: string,
  prisma: PrismaClient
) {
  const mappedActivities = activities
    .map((activity) => {
      const { data, timestamp, duration } = activity;
      const sanitizedData = sanitizeActivityData(data);
      return {
        ...sanitizedData,
        timestamp,
        duration,
        userId,
      };
    })
    .filter((activity) => {
      return !EXCLUDED_APPS.includes(activity.app) && activity.duration > 0;
    });

  await prisma.activity.createMany({
    data: mappedActivities,
  });

  return;
}

/**
 * Get all activities for a user with pagination and filtering
 */
export async function getActivities(
  userId: string,
  query: {
    startDate?: string;
    endDate?: string;
  },
  prisma: PrismaClient
): Promise<Activity[]> {
  const { startDate, endDate } = query;

  const activities = await prisma.activity.findMany({
    where: {
      userId,
      createdAt: {
        gte: new Date(startDate || ""),
        lte: new Date(endDate || ""),
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return activities;
}

/**
 * Update an activity
 */
export async function updateActivity(
  id: string,
  input: UpdateActivityInput,
  userId: string,
  prisma: PrismaClient
): Promise<ActivityResponse> {
  const { data = {}, timestamp, duration, description } = input;
  const sanitizedData = data ? sanitizeActivityData(data) : {};
  const activity = await prisma.activity.update({
    where: { id, userId },
    data: {
      ...sanitizedData,
      timestamp,
      duration,
      description: description ? sanitizeString(description) : description,
    },
  });

  return activity;
}

/**
 * Delete an activity
 */
export async function deleteActivity(
  id: string,
  userId: string,
  prisma: PrismaClient
): Promise<void> {
  await prisma.activity.delete({
    where: { id, userId },
  });
}

/**
 * Get activity statistics for a user
 */
export async function getActivityStats(
  userId: string,
  prisma: PrismaClient
): Promise<{
  totalActivities: number;
  totalDuration: number;
  topApps: Array<{ app: string; duration: number }>;
  recentActivity: ActivityResponse | null;
}> {
  const [totalActivities, totalDuration, topApps, recentActivity] =
    await Promise.all([
      prisma.activity.count({ where: { userId } }),
      prisma.activity.aggregate({
        where: { userId },
        _sum: { duration: true },
      }),
      prisma.activity.groupBy({
        by: ["app"],
        where: { userId },
        _sum: { duration: true },
        orderBy: { _sum: { duration: "desc" } },
        take: 5,
      }),
      prisma.activity.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  return {
    totalActivities,
    totalDuration: totalDuration._sum.duration || 0,
    topApps: topApps.map((item) => ({
      app: item.app,
      duration: item._sum.duration || 0,
    })),
    recentActivity,
  };
}

/**
 * Get activity statistics for a specific day
 */
export async function getTopApps(
  userId: string,
  query: {
    startDate?: string;
    endDate?: string;
  },
  prisma: PrismaClient
): Promise<{
  totalDuration: number;
  topApps: Array<{ app: string; duration: number }>;
}> {
  // Create date range for the specific day
  const { startDate, endDate } = query;

  const apps = await prisma.activity.groupBy({
    by: ["app"],
    where: {
      userId,
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
      app: { notIn: EXCLUDED_APPS },
    },
    _sum: { duration: true },

    orderBy: { _sum: { duration: "desc" } },
  });
  const totalDuration = apps.reduce(
    (acc, item) => acc + (item._sum?.duration || 0),
    0
  );
  // Get aggregated data for the day

  return {
    totalDuration: totalDuration || 0,
    topApps: apps.map((item) => ({
      app: item.app,
      duration: item._sum?.duration || 0,
    })),
  };
}

/**
 * Get top activities grouped by app and title
 */
export async function getTopActivities(
  userId: string,
  query: {
    startDate?: string;
    endDate?: string;
  },
  prisma: PrismaClient
): Promise<TopActivityResponse[]> {
  const { startDate, endDate } = query;

  const topActivities = await prisma.activity.groupBy({
    by: ["app", "title"],
    where: {
      userId,
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
      app: { notIn: EXCLUDED_APPS },
    },
    _sum: { duration: true },
    orderBy: { _sum: { duration: "desc" } },
    take: 20,
  });

  return topActivities.map((item) => ({
    app: item.app,
    title: item.title,
    duration: item._sum?.duration || 0,
  }));
}

/**
 * Select activities by updating their selected property to true
 */
export async function selectActivities(
  activityIds: string[],
  userId: string,
  prisma: PrismaClient,
  selected: boolean
): Promise<void> {
  // TODO: Handle project addition
  await prisma.activity.updateMany({
    where: {
      id: { in: activityIds },
      userId,
    },
    data: {
      selected,
    },
  });
}

/**
 * Group activities by entity (app + title) while preserving individual activity IDs and durations
 */
export function groupActivitiesByEntity(
  activities: Partial<Activity & { project: Project | null }>[]
): Array<{
  userId: string;
  app: string;
  title: string;
  selected: boolean;
  activityIds: string[];
  duration: number;
  projectId: number | null;
  projectName: string | null;
}> {
  const groupedData: Record<
    string,
    {
      userId: string;
      app: string;
      title: string;
      selected: boolean;
      activityIds: string[];
      duration: number;
      projectId: number | null;
      projectName: string | null;
    }
  > = {};

  activities.forEach((activity) => {
    const {
      userId = "",
      app = "",
      title = "",
      selected = false,
      duration = 0,
      id = "",
      projectId = null,
      project,
    } = activity;

    if (!userId || !app || !title || !id) {
      return;
    }

    const key = `${userId}|${app}|${title}|${selected}`;

    if (groupedData[key]) {
      // Add to existing group
      groupedData[key].activityIds.push(id);
      groupedData[key].duration += duration || 0;
    } else {
      // Create new group
      groupedData[key] = {
        userId,
        app,
        title,
        selected,
        activityIds: [id],
        duration: duration || 0,
        projectId,
        projectName: project?.name || "",
      };
    }
  });

  // Convert grouped data to array and sort by duration (descending)
  return Object.values(groupedData).sort((a, b) => b.duration - a.duration);
}

export async function activitiesForSelection(
  userId: string,
  prisma: PrismaClient,
  startDate: string,
  endDate: string
): Promise<
  Array<{
    userId: string;
    app: string;
    title: string;
    selected: boolean;
    activityIds: string[];
    duration: number;
    projectId: number | null;
    projectName: string | null;
  }>
> {
  const activities = await prisma.activity.findMany({
    where: {
      userId,
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
      app: { notIn: EXCLUDED_APPS },
    },
    include: {
      project: true,
    },
  });
  return groupActivitiesByEntity(activities);
}

/**
 * Add activities to a project by updating their projectId
 */
export async function addActivitiesToProject(
  activityIds: string[],
  projectId: number,
  userId: string,
  prisma: PrismaClient
): Promise<void> {
  // First verify that the project exists and the user has access to it
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      users: {
        some: {
          userId,
          active: true,
        },
      },
    },
  });

  if (!project) {
    throw new Error("Project not found or user does not have access to it");
  }

  // Update all activities with the project ID
  await prisma.activity.updateMany({
    where: {
      id: { in: activityIds },
      userId,
    },
    data: {
      projectId,
    },
  });
}

/**
 * Get user selected activities by user ID with optional date filtering
 */
export async function getUserSelectData(
  userId: string,
  query: {
    startDate?: string;
    endDate?: string;
  },
  prisma: PrismaClient
): Promise<
  Array<{
    duration: number;
    date: string;
  }>
> {
  const { startDate, endDate } = query;

  // Use raw SQL query to group by date(timestamp) and order by timestamp
  const activities = await prisma.$queryRaw<
    Array<{
      duration: number;
      date: string;
    }>
  >`
    SELECT 
      SUM(duration)::int as duration,
      DATE(timestamp) as date
    FROM activities 
    WHERE 
      "userId" = ${userId}
      AND selected = true
      AND app NOT IN (${Prisma.join(EXCLUDED_APPS)})
      ${startDate ? Prisma.sql`AND timestamp >= ${startDate}` : Prisma.empty}
      ${endDate ? Prisma.sql`AND timestamp <= ${endDate}` : Prisma.empty}
    GROUP BY DATE(timestamp)
    ORDER BY DATE(timestamp) DESC, SUM(duration) DESC
  `;

  return activities;
}

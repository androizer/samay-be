import { Activity, PrismaClient, Project, Prisma, Tag } from "@prisma/client";
import {
  ActivityResponse,
  CreateActivityInput,
  UpdateActivityInput,
  TopActivityResponse,
} from "./types";
import NodeCache from "node-cache";

const EXCLUDED_APPS = ["loginwindow", "dock"];

// Initialize cache with a TTL of 1 hour (3600 seconds)
const cache = new NodeCache({ stdTTL: 300 });

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
function sanitizeActivityData(
  activity: {
    app?: string;
    url?: string;
    title?: string;
  },
  tags: Tag[]
) {
  const sanitizedApp = sanitizeString(activity.app || "");
  const sanitizedTitle = sanitizeString(activity.title || "");
  const tag = tags.find(
    (t) =>
      t.app === sanitizedApp &&
      (t.title === "any" || t.title === sanitizedTitle)
  );

  return {
    ...activity,
    app: sanitizedApp,
    url: sanitizeString(activity.url || ""),
    title: sanitizedTitle,
    autoTags: tag ? tag.tag : "",
    isAutoTagged: tag ? true : false,
  };
}

/**
 * Create a new activity
 */
export async function createActivity(
  activities: CreateActivityInput[],
  profileId: string,
  prisma: PrismaClient
) {
  const tags = await getTags(prisma);

  const mappedActivities = activities
    .map((activity) => {
      const { data, timestamp, duration } = activity;
      const sanitizedData = sanitizeActivityData(data, tags);
      return {
        ...sanitizedData,
        timestamp,
        duration,
        profileId,
      };
    })
    .filter((activity) => {
      return (
        !EXCLUDED_APPS.includes(activity.app) &&
        activity.duration > 0 &&
        activity.app &&
        activity.title
      );
    });

  await prisma.activity.createMany({
    data: mappedActivities,
  });

  return;
}

/**
 * Get all tags from the database with caching
 * First checks cache, if not present fetches from DB and stores in cache
 */
export async function getTags(prisma: PrismaClient): Promise<Tag[]> {
  const cacheKey = "tags";

  // Check cache first
  const cachedTags = cache.get<Tag[]>(cacheKey);

  if (cachedTags) {
    return cachedTags;
  }

  // If not in cache, fetch from database
  const tags = await prisma.tag.findMany({
    where: { title: "any" },
    orderBy: { createdAt: "desc" },
  });

  // Store in cache
  cache.set(cacheKey, tags);

  return tags;
}

/**
 * Get all activities for a user with pagination and filtering
 */
export async function getActivities(
  profileId: string,
  query: {
    startDate?: string;
    endDate?: string;
  },
  prisma: PrismaClient
): Promise<ActivityResponse[]> {
  const { startDate, endDate } = query;

  const activities = await prisma.activity.findMany({
    where: {
      profileId,
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
  profileId: string,
  prisma: PrismaClient
): Promise<ActivityResponse> {
  const { data = {}, timestamp, duration, description } = input;
  const tags = await getTags(prisma);
  const sanitizedData = data ? sanitizeActivityData(data, tags) : {};
  const activity = await prisma.activity.update({
    where: { id, profileId },
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
  profileId: string,
  prisma: PrismaClient
): Promise<void> {
  await prisma.activity.delete({
    where: { id, profileId },
  });
}

/**
 * Get activity statistics for a user
 */
export async function getActivityStats(
  profileId: string,
  prisma: PrismaClient
): Promise<{
  totalActivities: number;
  totalDuration: number;
  topApps: Array<{ app: string; duration: number }>;
  recentActivity: ActivityResponse | null;
}> {
  const [totalActivities, totalDuration, topApps, recentActivity] =
    await Promise.all([
      prisma.activity.count({ where: { profileId } }),
      prisma.activity.aggregate({
        where: { profileId },
        _sum: { duration: true },
      }),
      prisma.activity.groupBy({
        by: ["app"],
        where: { profileId },
        _sum: { duration: true },
        orderBy: { _sum: { duration: "desc" } },
        take: 5,
      }),
      prisma.activity.findFirst({
        where: { profileId },
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
  profileId: string,
  query: {
    startDate?: string;
    endDate?: string;
  },
  prisma: PrismaClient
): Promise<{
  totalDuration: number;
  topApps: Array<{ app: string; duration: number }>;
  topTags: Array<{ tag: string; duration: number }>;
}> {
  // Create date range for the specific day
  const { startDate, endDate } = query;

  const apps = await prisma.activity.groupBy({
    by: ["app"],
    where: {
      profileId,
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
      app: { notIn: EXCLUDED_APPS },
    },
    _sum: { duration: true },
    take: 5,
    orderBy: { _sum: { duration: "desc" } },
  });
  const totalDuration = apps.reduce(
    (acc, item) => acc + (item._sum?.duration || 0),
    0
  );

  const tags = await prisma.activity.groupBy({
    by: ["autoTags"],
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
  });
  // Get aggregated data for the day

  return {
    totalDuration: totalDuration || 0,
    topApps: apps.map((item) => ({
      app: item.app,
      duration: item._sum?.duration || 0,
    })),
    topTags: tags.map((item) => ({
      tag: item.autoTags || "Other",
      duration: item._sum?.duration || 0,
    })),
  };
}

/**
 * Get top activities grouped by app and title
 */
export async function getTopActivities(
  profileId: string,
  query: {
    startDate?: string;
    endDate?: string;
  },
  prisma: PrismaClient
): Promise<TopActivityResponse[]> {
  const { startDate, endDate } = query;

  const topActivities = await prisma.activity.groupBy({
    by: ["app", "title", "autoTags"],
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
    take: 20,
  });

  return topActivities.map((item) => ({
    app: item.app,
    title: item.title,
    duration: item._sum?.duration || 0,
    tag: item.autoTags || "",
  }));
}

/**
 * Select activities by updating their selected property to true
 */
export async function selectActivities(
  activityIds: string[],
  profileId: string,
  prisma: PrismaClient,
  selected: boolean
): Promise<void> {
  // TODO: Handle project addition
  await prisma.activity.updateMany({
    where: {
      id: { in: activityIds },
      profileId,
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
  profileId: string;
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
      profileId: string;
      app: string;
      title: string;
      selected: boolean;
      activityIds: string[];
      duration: number;
      projectId: number | null;
      projectName: string | null;
      tag: string;
    }
  > = {};

  activities.forEach((activity) => {
    const {
      profileId = "",
      app = "",
      title = "",
      selected = false,
      duration = 0,
      id = "",
      projectId = null,
      project,
      autoTags = "",
    } = activity;

    if (!profileId || !app || !title || !id) {
      return;
    }

    const key = `${profileId}|${app}|${title}|${selected}`;

    if (groupedData[key]) {
      // Add to existing group
      groupedData[key].activityIds.push(id);
      groupedData[key].duration += duration || 0;
    } else {
      // Create new group
      groupedData[key] = {
        profileId,
        app,
        title,
        selected,
        activityIds: [id],
        duration: duration || 0,
        projectId,
        projectName: project?.name || "",
        tag: autoTags || "",
      };
    }
  });

  // Convert grouped data to array and sort by duration (descending)
  return Object.values(groupedData)
    .sort((a, b) => b.duration - a.duration)
    .filter((item) => item.duration > 60);
}

export async function activitiesForSelection(
  profileId: string,
  prisma: PrismaClient,
  startDate: string,
  endDate: string
): Promise<
  Array<{
    profileId: string;
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
      profileId,
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
  profileId: string,
  prisma: PrismaClient
): Promise<void> {
  // First verify that the project exists and the user has access to it
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      // workspaceId check is implicit via profile access to project? 
      // Or we need to check if profile belongs to the workspace of the project.
      // But project is linked to workspace. Profile is linked to workspace.
      // We should check if project.workspaceId == profile.workspaceId.
      // However, prisma query here checks if project has users (ProjectUser) that match profileId.
      // But we are ADDING activities to project. We need to check if user has access to project.
      users: {
        some: {
          profileId,
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
      profileId,
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
  profileId: string,
  query: {
    startDate?: string;
    endDate?: string;
  },
  prisma: PrismaClient
): Promise<{
  activities: Array<{
    duration: number;
    date: string;
  }>;
  activitiesByTag: Array<{
    tag: string;
    duration: number;
  }>;
}> {
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
      "profileId" = ${profileId}
      AND selected = true
      AND app NOT IN (${Prisma.join(EXCLUDED_APPS)})
      ${startDate ? Prisma.sql`AND timestamp >= ${startDate}` : Prisma.empty}
      ${endDate ? Prisma.sql`AND timestamp <= ${endDate}` : Prisma.empty}
    GROUP BY DATE(timestamp)
    ORDER BY DATE(timestamp) DESC, SUM(duration) DESC
  `;

  const activitiesByTagResult = await prisma.activity.groupBy({
    by: ["autoTags"],
    where: {
      profileId,
      selected: true,
      app: { notIn: EXCLUDED_APPS },
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
    },
    _sum: { duration: true },
    orderBy: { _sum: { duration: "desc" } },
  });

  const activitiesByTag = activitiesByTagResult.map((item) => ({
    tag: item.autoTags || "",
    duration: item._sum.duration || 0,
  }));

  return { activities, activitiesByTag };
}

import { z } from "zod";
import {
  CREATE_ACTIVITY_SCHEMA,
  UPDATE_ACTIVITY_SCHEMA,
  USER_SELECT_DATA_QUERY_SCHEMA,
} from "./schema";

export type CreateActivityInput = z.infer<typeof CREATE_ACTIVITY_SCHEMA>;
export type UpdateActivityInput = z.infer<typeof UPDATE_ACTIVITY_SCHEMA>;
export type UserSelectDataQuery = z.infer<typeof USER_SELECT_DATA_QUERY_SCHEMA>;

// Activity interface (partial of Prisma Activity)
export interface ActivityResponse {
  id: string;
  profileId: string;
  app: string;
  url: string;
  title: string;
  description: string | null;
  timestamp: string;
  duration: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// Top activities response interface
export interface TopActivityResponse {
  app: string;
  title: string;
  duration: number;
  tag: string;
}

// User select data response interface
export interface UserSelectDataResponse {
  date: string;
  totalDuration: number;
  activities: Array<{
    userId: string;
    app: string;
    title: string;
    selected: boolean;
    activityIds: string[];
    duration: number;
    projectId: number | null;
    projectName: string | null;
  }>;
}

import { z } from "zod";
import {
  CREATE_PROJECT_SCHEMA,
  UPDATE_PROJECT_SCHEMA,
  ADD_USERS_TO_PROJECT_SCHEMA,
  DELETE_USERS_FROM_PROJECT_SCHEMA,
} from "./schema";

export type CreateProjectInput = z.infer<typeof CREATE_PROJECT_SCHEMA>;
export type UpdateProjectInput = z.infer<typeof UPDATE_PROJECT_SCHEMA>;
export type AddUsersToProjectInput = z.infer<
  typeof ADD_USERS_TO_PROJECT_SCHEMA
>;
export type DeleteUsersFromProjectInput = z.infer<
  typeof DELETE_USERS_FROM_PROJECT_SCHEMA
>;

// Project interface (partial of Prisma Project)
export interface ProjectResponse {
  id: number;
  name: string;
  description: string | null;
  icon: string;
  createdAt: Date;
  updatedAt: Date;
  users?: {
    profileId: string;
    profile: {
      id: string;
      name: string;
      user: {
        email: string;
      };
    };
  }[];
}

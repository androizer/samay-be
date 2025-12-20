import { z } from "zod";

export const CREATE_PROJECT_SCHEMA = z.object({
  name: z
    .string()
    .min(1, "Project name is required")
    .max(100, "Project name must be less than 100 characters"),
  description: z
    .string()
    .max(500, "Description must be less than 500 characters")
    .optional(),
  icon: z.string().optional(),
});

export const UPDATE_PROJECT_SCHEMA = z.object({
  name: z
    .string()
    .min(1, "Project name is required")
    .max(100, "Project name must be less than 100 characters")
    .optional(),
  description: z
    .string()
    .max(500, "Description must be less than 500 characters")
    .optional(),
  icon: z.string().optional(),
});

export const PROJECT_ID_PARAM_SCHEMA = z.object({
  id: z.string().min(1, "Project ID is required"),
});

export const DELETE_USERS_FROM_PROJECT_PARAM_SCHEMA = z.object({
  id: z.string().min(1, "Project ID is required"),
  profileId: z.string().min(1, "Profile ID is required"),
});

export const ADD_USERS_TO_PROJECT_SCHEMA = z.object({
  profileIds: z
    .array(z.string().min(1, "Profile ID is required"))
    .min(1, "At least one profile ID is required")
    .max(50, "Cannot add more than 50 profiles at once"),
});

export const DELETE_USERS_FROM_PROJECT_SCHEMA = z.object({
  profileIds: z
    .array(z.string().min(1, "Profile ID is required"))
    .min(1, "At least one profile ID is required")
    .max(50, "Cannot delete more than 50 profiles at once"),
});

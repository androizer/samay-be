import { z } from "zod/v4";
import { Role } from "@prisma/client";

export const CREATE_WORKSPACE_SCHEMA = z.object({
  name: z.string().min(1, "Workspace name is required").max(100),
});

export const UPDATE_WORKSPACE_SCHEMA = z.object({
  name: z.string().min(1, "Workspace name is required").max(100),
});

export const WORKSPACE_ID_PARAM_SCHEMA = z.object({
  id: z.string().min(1, "Workspace ID is required"),
});

export const DELETE_USER_PARAM_SCHEMA = z.object({
  userId: z.string().min(1, "User ID is required"),
  id: z.string().min(1, "Workspace ID is required"),
});

// Invitation schemas
export const CREATE_INVITATION_SCHEMA = z.object({
  email: z.email("Invalid email address"),
  role: z.enum(Role).default(Role.USER),
});

export const ACCEPT_INVITATION_SCHEMA = z.object({
  token: z.string().min(1, "Token is required"),
});

export const INVITATION_QUERY_SCHEMA = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const INVITATION_ID_PARAM_SCHEMA = z.object({
  id: z.string().min(1, "Invitation ID is required"),
});

import { z } from "zod";

export const CREATE_WORKSPACE_SCHEMA = z.object({
  name: z.string().min(1, "Workspace name is required").max(100),
});

export const UPDATE_WORKSPACE_SCHEMA = z.object({
  name: z.string().min(1, "Workspace name is required").max(100),
});

export const WORKSPACE_ID_PARAM_SCHEMA = z.object({
  id: z.string().min(1, "Workspace ID is required"),
});

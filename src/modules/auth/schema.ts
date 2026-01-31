import { z } from "zod/v4";

// Validation schemas
export const REGISTER_SCHEMA = z.object({
  email: z.email("Invalid email format"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d@$!%*?&]/,
      "Password must contain at least one uppercase letter, one lowercase letter, one number"
    ),
  name: z.string().min(1, "Name is required"),
});

export const LOGIN_SCHEMA = z.object({
  email: z.email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export const SWITCH_WORKSPACE_SCHEMA = z.object({
  workspaceId: z.string().min(1, "Workspace ID is required"),
});

export const GET_USER_BY_ID_SCHEMA = z.object({
  id: z.string().min(1, "User ID is required"),
});

export const MAKE_PROFILE_DEFAULT_SCHEMA = z.object({
  workspaceId: z.string().min(1, "Workspace ID is required"),
});

export const VERIFY_EMAIL_TOKEN_SCHEMA = z.object({
  token: z.string().min(1, "Verification token is required"),
});

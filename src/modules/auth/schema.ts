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

export const GET_USER_BY_ID_SCHEMA = z.object({
  id: z.string().min(1, "User ID is required"),
});

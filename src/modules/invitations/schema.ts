import { z } from "zod";
import { Role } from "@prisma/client";

export const CREATE_INVITATION_SCHEMA = z.object({
  email: z.string().email("Invalid email address"),
  role: z.nativeEnum(Role).default(Role.USER),
});

export const ACCEPT_INVITATION_SCHEMA = z.object({
  token: z.string().min(1, "Token is required"),
  name: z.string().min(1, "Name is required").optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
});

export const INVITATION_QUERY_SCHEMA = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

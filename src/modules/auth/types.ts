import { z } from "zod";
import { LOGIN_SCHEMA, REGISTER_SCHEMA } from "./schema";

export type RegisterInput = z.infer<typeof REGISTER_SCHEMA>;
export type LoginInput = z.infer<typeof LOGIN_SCHEMA>;

// User interface (partial of Prisma User)
export interface UserResponse {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: Date;
  defaultWorkspaceId?: string | null;
}

export interface WorkspaceResponse {
  id: string;
  name: string;
  role: string;
}

export interface AuthResponse {
  user: UserResponse;
  token: string;
  workspaces: WorkspaceResponse[];
}

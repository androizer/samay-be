import { z } from "zod";
import {
  LOGIN_SCHEMA,
  REGISTER_SCHEMA,
  SWITCH_WORKSPACE_SCHEMA,
  MAKE_PROFILE_DEFAULT_SCHEMA,
} from "./schema";

export type RegisterInput = z.infer<typeof REGISTER_SCHEMA>;
export type LoginInput = z.infer<typeof LOGIN_SCHEMA>;
export type SwitchWorkspaceInput = z.infer<typeof SWITCH_WORKSPACE_SCHEMA>;
export type MakeProfileDefaultInput = z.infer<
  typeof MAKE_PROFILE_DEFAULT_SCHEMA
>;

// User interface (partial of Prisma User)
export interface UserResponse {
  userId: string;
  email: string;
  name: string | null;
  profileId: string;
  workspaceId: string;
  workspaceName: string;
  role: string;
  emailVerified: boolean;
  createdAt: Date;
}

export interface AuthResponse {
  user: UserResponse;
  token: string;
}

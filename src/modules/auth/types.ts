import { z } from "zod";
import {
  LOGIN_SCHEMA,
  REGISTER_SCHEMA,
  SWITCH_WORKSPACE_SCHEMA,
} from "./schema";

export type RegisterInput = z.infer<typeof REGISTER_SCHEMA>;
export type LoginInput = z.infer<typeof LOGIN_SCHEMA>;
export type SwitchWorkspaceInput = z.infer<typeof SWITCH_WORKSPACE_SCHEMA>;

// User interface (partial of Prisma User)
export interface UserResponse {
  id: string;
  email: string;
  name: string | null;
  profileId: string;
  workspaceId: string;
  role: string;
}

export interface ProfileResponse {
  id: string;
  workspaceId: string;
  role: string;
  workspace: {
    id: string;
    name: string;
  };
}

export interface AuthResponse {
  user: UserResponse;
  token: string;
}

export interface SwitchWorkspaceResponse {
  token: string;
  workspace: {
    id: string;
    name: string;
  };
  role: string;
}

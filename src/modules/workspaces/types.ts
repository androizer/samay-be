import { z } from "zod";
import {
  CREATE_WORKSPACE_SCHEMA,
  UPDATE_WORKSPACE_SCHEMA,
  DELETE_USER_PARAM_SCHEMA,
  CREATE_INVITATION_SCHEMA,
  ACCEPT_INVITATION_SCHEMA,
  INVITATION_QUERY_SCHEMA,
} from "./schema";

export type CreateWorkspaceInput = z.infer<typeof CREATE_WORKSPACE_SCHEMA>;
export type UpdateWorkspaceInput = z.infer<typeof UPDATE_WORKSPACE_SCHEMA>;
export type DeleteUserInput = z.infer<typeof DELETE_USER_PARAM_SCHEMA>;
export type CreateInvitationInput = z.infer<typeof CREATE_INVITATION_SCHEMA>;
export type AcceptInvitationInput = z.infer<typeof ACCEPT_INVITATION_SCHEMA>;
export type InvitationQuery = z.infer<typeof INVITATION_QUERY_SCHEMA>;

export interface WorkspaceResponse {
  id: string;
  name: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
  isDefault: boolean;
  workspaceName: string;
}

export interface InvitationResponse {
  id: string;
  email: string;
  role: string;
  token: string;
  expiresAt: Date;
  inviter: {
    name: string | null;
    email: string;
  };
  createdAt: Date;
}

export interface WorkspaceUserResponse {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  joinedAt: Date;
  isDefault: boolean;
  isVerified: boolean;
}

export interface WorkspaceWithProfilesResponse {
  workspace: WorkspaceResponse;
  profiles: WorkspaceUserResponse[];
}

import { z } from "zod";
import { CREATE_WORKSPACE_SCHEMA, UPDATE_WORKSPACE_SCHEMA } from "./schema";

export type CreateWorkspaceInput = z.infer<typeof CREATE_WORKSPACE_SCHEMA>;
export type UpdateWorkspaceInput = z.infer<typeof UPDATE_WORKSPACE_SCHEMA>;

export interface WorkspaceResponse {
  id: string;
  name: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
  isDefault: boolean;
  workspaceName: string;
}

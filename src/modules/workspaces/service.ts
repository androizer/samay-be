import { PrismaClient, Role } from "@prisma/client";
import {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  WorkspaceResponse,
} from "./types";
import { AppError } from "../../plugins/error/plugin";

/**
 * Create a new workspace
 */
export async function createWorkspace(
  prisma: PrismaClient,
  input: CreateWorkspaceInput,
  userId: string
): Promise<WorkspaceResponse> {
  const { name } = input;

  // Get user name for fallback
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const userName = user?.name || "Unknown";

  const workspace = await prisma.workspace.create({
    data: {
      name,
      ownerId: userId,
      profiles: {
        create: {
          userId,
          role: Role.ADMIN,
          name: userName,
        },
      },
    },
    include: {
      profiles: {
        where: { userId },
      },
    },
  });

  return {
    id: workspace.id,
    name: workspace.name,
    role: workspace.profiles[0].role,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  };
}

/**
 * Get all workspaces for a user
 */
export async function getWorkspaces(
  prisma: PrismaClient,
  userId: string
): Promise<WorkspaceResponse[]> {
  const profiles = await prisma.profile.findMany({
    where: { userId },
    include: {
      workspace: true,
    },
    orderBy: { joinedAt: "desc" },
  });

  return profiles.map((profile) => ({
    id: profile.workspace.id,
    name: profile.workspace.name,
    role: profile.role,
    createdAt: profile.workspace.createdAt,
    updatedAt: profile.workspace.updatedAt,
  }));
}

/**
 * Update a workspace
 */
export async function updateWorkspace(
  prisma: PrismaClient,
  id: string,
  input: UpdateWorkspaceInput,
  userId: string
): Promise<WorkspaceResponse> {
  // Verify user is admin of the workspace
  const profile = await prisma.profile.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: id,
        userId,
      },
      role: Role.ADMIN,
    },
  });

  if (!profile) {
    throw new AppError(
      "You are not authorized to update this workspace",
      403,
      "FORBIDDEN"
    );
  }

  const workspace = await prisma.workspace.update({
    where: { id },
    data: {
      name: input.name,
    },
  });

  // We need to return role, but update doesn't give context of user.
  // This function assumes caller checked permissions.
  // We can return "ADMIN" or fetch profile.
  // Let's just return minimal info or fetch profile if needed.
  // For simplicity, we might need to change return type or fetch profile.
  // But wait, the response type requires role.
  // Let's assume the user updating is ADMIN.

  return {
    id: workspace.id,
    name: workspace.name,
    role: Role.ADMIN, // Only admins can update
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  };
}

/**
 * Delete a workspace
 */
export async function deleteWorkspace(
  prisma: PrismaClient,
  id: string,
  userId: string
): Promise<void> {
  const profile = await prisma.profile.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: id,
        userId,
      },
    },
  });

  if (!profile) {
    throw new AppError(
      "You are not authorized to delete this workspace",
      403,
      "FORBIDDEN"
    );
  }

  await prisma.workspace.delete({
    where: { id },
  });
}

import { PrismaClient, Role } from "@prisma/client";
import {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  WorkspaceResponse,
  DeleteUserInput,
  CreateInvitationInput,
  AcceptInvitationInput,
  InvitationResponse,
  InvitationQuery,
} from "./types";
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../plugins/error/plugin";
import { randomUUID } from "crypto";

/**
 * Create a new workspace
 */
export async function createWorkspace(
  prisma: PrismaClient,
  input: CreateWorkspaceInput,
  userId: string,
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
    isDefault: workspace.profiles[0].isDefault,
    workspaceName: workspace.name,
  };
}

/**
 * Get all workspaces for a user
 */
export async function getWorkspaces(
  prisma: PrismaClient,
  userId: string,
): Promise<WorkspaceResponse[]> {
  const profiles = await prisma.profile.findMany({
    where: { userId },
    include: {
      workspace: true,
    },
    orderBy: { id: "asc" },
  });

  return profiles.map((profile) => ({
    id: profile.workspace.id,
    name: profile.workspace.name,
    role: profile.role,
    createdAt: profile.workspace.createdAt,
    updatedAt: profile.workspace.updatedAt,
    isDefault: profile.isDefault,
    workspaceName: profile.workspace.name,
  }));
}

/**
 * Update a workspace
 */
export async function updateWorkspace(
  prisma: PrismaClient,
  id: string,
  input: UpdateWorkspaceInput,
  userId: string,
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
      "FORBIDDEN",
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
    isDefault: profile.isDefault,
    workspaceName: workspace.name,
  };
}

/**
 * Delete a workspace
 */
export async function deleteWorkspace(
  prisma: PrismaClient,
  id: string,
  userId: string,
): Promise<void> {
  const profile = await prisma.profile.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: id,
        userId: userId,
      },
      role: Role.ADMIN,
    },
  });

  if (!profile) {
    throw new AppError(
      "You are not authorized to delete this workspace",
      403,
      "FORBIDDEN",
    );
  }

  await prisma.workspace.delete({
    where: { id },
  });
}

/**
 * Create a new invitation
 */
export async function createInvitation(
  prisma: PrismaClient,
  input: CreateInvitationInput,
  inviterId: string,
  workspaceId: string,
): Promise<InvitationResponse> {
  const { email, role = "USER" } = input;

  // Check if user is already a member of the workspace
  const existingMember = await prisma.profile.findFirst({
    where: {
      workspaceId,
      user: {
        email,
      },
    },
  });

  if (existingMember) {
    throw new ConflictError("User is already a member of this workspace");
  }

  // Check if invitation already exists
  const existingInvitation = await prisma.invitation.findUnique({
    where: {
      email_workspaceId: {
        email,
        workspaceId,
      },
    },
  });

  if (existingInvitation) {
    // If expired, delete and create new? Or update?
    // For now, let's throw error or return existing.
    // Let's delete and create new to refresh token.
    await prisma.invitation.delete({
      where: { id: existingInvitation.id },
    });
  }

  const token = randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

  const invitation = await prisma.invitation
    .create({
      data: {
        email,
        role,
        workspaceId,
        inviterId,
        token,
        expiresAt,
      },
      include: {
        inviter: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    })
    .catch((e) => {
      if (e.code === "P2002") {
        throw new ConflictError("Invitation already exists");
      }
      throw e;
    });

  // TODO: Send email
  // TODO: Send email
  const baseUrl = process.env.APP_URL || "http://localhost:3000";
  console.log(`Invitation link: ${baseUrl}/accept-invite?token=${token}`);

  return invitation;
}

/**
 * Invite a user to a workspace (admin only)
 */
export async function inviteUserToWorkspace(
  prisma: PrismaClient,
  workspaceId: string,
  input: CreateInvitationInput,
  inviterId: string,
): Promise<InvitationResponse> {
  // Verify inviter is admin of the workspace
  const profile = await prisma.profile.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: inviterId,
      },
      role: Role.ADMIN,
    },
  });

  if (!profile) {
    throw new AppError(
      "You are not authorized to invite users to this workspace",
      403,
      "FORBIDDEN",
    );
  }

  // Use the invitation service
  return await createInvitation(prisma, input, inviterId, workspaceId);
}

/**
 * Accept an invitation (logged-in users only)
 */
export async function acceptInvitation(
  prisma: PrismaClient,
  input: AcceptInvitationInput,
  userId: string,
) {
  const { token } = input;

  return await prisma.$transaction(async (tx) => {
    // Get the logged-in user
    const user = await tx.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Get the invitation
    const invitation = await tx.invitation.findUnique({
      where: { token },
      include: {
        workspace: true,
      },
    });

    if (!invitation) {
      throw new NotFoundError("Invalid invitation token");
    }

    if (invitation.expiresAt < new Date()) {
      throw new ValidationError("Invitation has expired");
    }

    // Verify that the logged-in user's email matches the invitation email
    if (user.email !== invitation.email) {
      throw new ValidationError(
        "This invitation was sent to a different email address",
      );
    }

    // Check if user is already a member of the workspace
    const existingProfile = await tx.profile.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: invitation.workspaceId,
          userId: user.id,
        },
      },
    });

    if (existingProfile) {
      throw new ConflictError("User is already a member of this workspace");
    }

    // Create profile
    await tx.profile.create({
      data: {
        userId: user.id,
        workspaceId: invitation.workspaceId,
        role: invitation.role,
        name: user.name || "Unknown",
      },
    });

    // Delete invitation
    await tx.invitation.delete({
      where: { id: invitation.id },
    });

    return {
      message: "Invitation accepted successfully",
      workspaceId: invitation.workspaceId,
    };
  });
}

/**
 * Get pending invitations for a workspace
 */
export async function getPendingInvitations(
  prisma: PrismaClient,
  workspaceId: string,
  query: InvitationQuery,
): Promise<InvitationResponse[]> {
  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const invitations = await prisma.invitation.findMany({
    where: {
      workspaceId,
    },
    include: {
      inviter: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    skip,
    take: limit,
  });

  return invitations;
}

/**
 * Delete an invitation
 */
export async function deleteInvitation(
  prisma: PrismaClient,
  id: string,
  workspaceId: string,
) {
  await prisma.invitation.delete({
    where: {
      id,
      workspaceId,
    },
  });
}

/**
 * Delete a user from a workspace (admin only)
 */
export async function deleteUserFromWorkspace(
  prisma: PrismaClient,
  workspaceId: string,
  input: DeleteUserInput,
  adminId: string,
): Promise<void> {
  const { userId } = input;

  // Verify requester is admin of the workspace
  const adminProfile = await prisma.profile.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: adminId,
      },
      role: Role.ADMIN,
    },
  });

  if (!adminProfile) {
    throw new AppError(
      "You are not authorized to remove users from this workspace",
      403,
      "FORBIDDEN",
    );
  }

  // Prevent admin from removing themselves
  if (userId === adminId) {
    throw new AppError(
      "You cannot remove yourself from the workspace",
      400,
      "BAD_REQUEST",
    );
  }

  // Check if user exists in the workspace
  const userProfile = await prisma.profile.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
  });

  if (!userProfile) {
    throw new AppError(
      "User is not a member of this workspace",
      404,
      "NOT_FOUND",
    );
  }

  // Delete the profile (this will cascade delete related data)
  await prisma.profile.delete({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
  });
}

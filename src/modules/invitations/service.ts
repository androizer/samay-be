import { PrismaClient } from "@prisma/client";
import {
  CreateInvitationInput,
  AcceptInvitationInput,
  InvitationResponse,
  InvitationQuery,
} from "./types";
import { randomUUID } from "crypto";
import argon2 from "argon2";

/**
 * Create a new invitation
 */
export async function createInvitation(
  prisma: PrismaClient,
  input: CreateInvitationInput,
  inviterId: string,
  workspaceId: string
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
    throw new Error("User is already a member of this workspace");
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
        throw new Error("Invitation already exists");
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
 * Accept an invitation
 */
export async function acceptInvitation(
  prisma: PrismaClient,
  input: AcceptInvitationInput
) {
  const { token, name, password } = input;

  return await prisma.$transaction(async (tx) => {
    const invitation = await tx.invitation.findUnique({
      where: { token },
      include: {
        workspace: true,
      },
    });

    if (!invitation) {
      throw new Error("Invalid invitation token");
    }

    if (invitation.expiresAt < new Date()) {
      throw new Error("Invitation has expired");
    }

    // Check if user exists
    let user = await tx.user.findUnique({
      where: { email: invitation.email },
    });

    if (!user) {
      if (!password || !name) {
        throw new Error("Name and password are required for new users");
      }

      const hashedPassword = await argon2.hash(password);

      user = await tx.user.create({
        data: {
          email: invitation.email,
          password: hashedPassword,
          name,
        },
      });
    }

    // Create profile
    await tx.profile.create({
      data: {
        userId: user.id,
        workspaceId: invitation.workspaceId,
        role: invitation.role,
        name: user.name || name || "Unknown", // Use global name or provided name
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
  query: InvitationQuery
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
  workspaceId: string
) {
  await prisma.invitation.delete({
    where: {
      id,
      workspaceId,
    },
  });
}

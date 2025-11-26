import { PrismaClient } from "@prisma/client";
import {
  ProjectResponse,
  CreateProjectInput,
  UpdateProjectInput,
  AddUsersToProjectInput,
} from "./types";

/**
 * Create a new project
 */
export async function createProject(
  prisma: PrismaClient,
  input: CreateProjectInput,
  workspaceId: string
): Promise<ProjectResponse> {
  const project = await prisma.project.create({
    data: {
      ...input,
      icon: input.icon || "",
      workspaceId,
    },
  });

  return project;
}

/**
 * Get all projects for a user with pagination and search
 */
export async function getProjects(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  isAdmin: boolean
): Promise<ProjectResponse[]> {
  const [projects] = await Promise.all([
    prisma.project.findMany({
      where: {
        workspaceId,
        users: isAdmin ? undefined : { some: { userId } },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        icon: true,
        createdAt: true,
        updatedAt: true,
        users: {
          where: { active: true },
          select: {
            userId: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    }),
  ]);

  return projects;
}

/**
 * Get a single project by ID
 */
export async function getProject(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  isAdmin: boolean,
  id: number
): Promise<ProjectResponse | null> {
  const project = await prisma.project.findFirst({
    select: {
      id: true,
      name: true,
      description: true,
      icon: true,
      createdAt: true,
      updatedAt: true,
      users: {
        where: { active: true },
        select: {
          userId: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
    where: isAdmin
      ? { id, workspaceId }
      : { id, workspaceId, users: { some: { userId } } },
  });

  return project;
}

/**
 * Update a project
 */
export async function updateProject(
  prisma: PrismaClient,
  id: number,
  workspaceId: string,
  input: UpdateProjectInput
): Promise<ProjectResponse> {
  const project = await prisma.project.update({
    where: { id, workspaceId },
    data: {
      ...input,
      updatedAt: new Date(),
    },
  });

  return project;
}

/**
 * Delete a project
 */
export async function deleteProject(
  prisma: PrismaClient,
  id: number,
  workspaceId: string
): Promise<void> {
  await prisma.project.delete({
    where: { id, workspaceId },
  });
}

/**
 * Add users to a project
 */
// Add workspace check
export async function addUsersToProject(
  prisma: PrismaClient,
  projectId: number,
  input: AddUsersToProjectInput
) {
  const existingRelations = await prisma.projectUser.findMany({
    where: {
      projectId,
      userId: {
        in: input.userIds,
      },
    },
    select: { userId: true },
  });

  await prisma.$transaction(async (tx) => {
    // Check for existing project-user relationships

    const existingUserIds = existingRelations.map((rel) => rel.userId);
    const newUserIds = input.userIds.filter(
      (id) => !existingUserIds.includes(id)
    );

    // Reactivate existing users
    if (existingUserIds.length > 0) {
      await tx.projectUser.updateMany({
        where: {
          projectId,
          userId: {
            in: existingUserIds,
          },
        },
        data: {
          active: true,
        },
      });
    }

    // Add new users to the project
    if (newUserIds.length > 0) {
      await tx.projectUser.createMany({
        data: newUserIds.map((userId) => ({
          projectId,
          userId,
          active: true,
        })),
      });
    }
  });
}

/**
 * Delete users from a project
 */
export async function deleteUsersFromProject(
  prisma: PrismaClient,
  projectId: number,
  userId: string
) {
  // Delete users from the project
  await prisma.projectUser.updateMany({
    where: {
      projectId,
      userId: {
        in: [userId],
      },
    },
    data: {
      active: false,
    },
  });
}

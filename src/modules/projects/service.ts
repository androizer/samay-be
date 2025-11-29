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
  workspaceId: string,
  profileId: string
): Promise<ProjectResponse> {
  const project = await prisma.project.create({
    data: {
      ...input,
      icon: input.icon || "",
      workspaceId,
      users: {
        create: {
          profileId,
          active: true,
        },
      },
    },
  });

  return project;
}

/**
 * Get all projects for a user with pagination and search
 */
export async function getProjects(
  prisma: PrismaClient,
  profileId: string,
  workspaceId: string,
  isAdmin: boolean
): Promise<ProjectResponse[]> {
  const [projects] = await Promise.all([
    prisma.project.findMany({
      where: {
        workspaceId,
        users: isAdmin ? undefined : { some: { profileId } },
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
            profileId: true,
            profile: {
              select: {
                id: true,
                name: true,
                user: {
                  select: {
                    email: true,
                  },
                },
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
  profileId: string,
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
          profileId: true,
          profile: {
            select: {
              id: true,
              name: true,
              user: {
                select: {
                  email: true,
                },
              },
            },
          },
        },
      },
    },
    where: isAdmin
      ? { id, workspaceId }
      : { id, workspaceId, users: { some: { profileId } } },
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
  // Get the project to check its workspaceId
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  // Verify all profiles belong to the same workspace
  const profiles = await prisma.profile.findMany({
    where: {
      id: { in: input.profileIds },
      workspaceId: project.workspaceId,
    },
    select: { id: true },
  });

  if (profiles.length !== input.profileIds.length) {
    throw new Error("One or more profiles do not belong to the project's workspace");
  }

  const existingRelations = await prisma.projectUser.findMany({
    where: {
      projectId,
      profileId: {
        in: input.profileIds,
      },
    },
    select: { profileId: true },
  });

  await prisma.$transaction(async (tx) => {
    // Check for existing project-user relationships

    const existingProfileIds = existingRelations.map((rel) => rel.profileId);
    const newProfileIds = input.profileIds.filter(
      (id) => !existingProfileIds.includes(id)
    );

    // Reactivate existing users
    if (existingProfileIds.length > 0) {
      await tx.projectUser.updateMany({
        where: {
          projectId,
          profileId: {
            in: existingProfileIds,
          },
        },
        data: {
          active: true,
        },
      });
    }

    // Add new users to the project
    if (newProfileIds.length > 0) {
      await tx.projectUser.createMany({
        data: newProfileIds.map((profileId) => ({
          projectId,
          profileId,
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
  profileId: string
) {
  // Delete users from the project
  await prisma.projectUser.updateMany({
    where: {
      projectId,
      profileId: {
        in: [profileId],
      },
    },
    data: {
      active: false,
    },
  });
}

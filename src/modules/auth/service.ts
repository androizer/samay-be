import { PrismaClient, User, Role } from "@prisma/client";
import * as argon2 from "argon2";
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { AuthResponse, LoginInput, RegisterInput, UserResponse, SwitchWorkspaceInput, SwitchWorkspaceResponse } from "./types";
import { AppError } from "../../plugins/error/plugin";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const JWT_EXPIRES_IN = "7d";

/**
 * Register a new user
 */
export async function register(
  input: RegisterInput,
  prisma: PrismaClient
): Promise<AuthResponse> {
  const { email, password, name } = input;

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new AppError(
      "User with this email already exists",
      409,
      "USER_EXISTS"
    );
  }

  // Hash password
  const hashedPassword = await argon2.hash(password);

  // Create user and default workspace in transaction
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
      },
    });

    const workspace = await tx.workspace.create({
      data: {
        name: `${name}'s Workspace`,
        ownerId: user.id,
        profiles: {
          create: {
            userId: user.id,
            name: name,
            role: Role.ADMIN,
          },
        },
      },
    });

    // Fetch the created profile
    const profile = await tx.profile.findFirstOrThrow({
      where: { workspaceId: workspace.id, userId: user.id },
    });

    return { user, workspace, profile };
  });

  const { user, workspace, profile } = result;

  // Generate JWT token
  const token = generateToken(user, profile.id, workspace.id, Role.ADMIN);

  // Session creation removed

  return {
    user: {
      id: user.id,
      email: user.email,
      name: name, // Return the name provided during registration
      createdAt: user.createdAt,
    },
    token,
    profiles: [
      {
        id: profile.id,
        workspaceId: workspace.id,
        role: Role.ADMIN,
        workspace: {
          id: workspace.id,
          name: workspace.name,
        },
      },
    ],
    currentProfile: {
      id: profile.id,
      workspaceId: workspace.id,
      role: Role.ADMIN,
      workspace: {
        id: workspace.id,
        name: workspace.name,
      },
    },
  };
}

/**
 * Login user
 */
export async function login(
  input: LoginInput,
  prisma: PrismaClient
): Promise<AuthResponse> {
  const { email, password, workspaceId } = input;

  // Find user
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }

  // Verify password
  const isValidPassword = await argon2.verify(user.password, password);

  if (!isValidPassword) {
    throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }

  // Get user's profiles
  let profiles = await prisma.profile.findMany({
    where: { userId: user.id },
    include: { workspace: true },
  });

  // Migration: Create default workspace if none exists (legacy support)
  if (profiles.length === 0) {
    const workspace = await prisma.workspace.create({
      data: {
        name: "My Workspace",
        ownerId: user.id,
        profiles: {
          create: {
            userId: user.id,
            name: "User", // Default name
            role: Role.ADMIN,
          },
        },
      },
    });

    // Refresh profiles list
    profiles = await prisma.profile.findMany({
      where: { userId: user.id },
      include: { workspace: true },
    });
  }

  // Determine target profile
  let targetProfile = profiles[0];

  if (workspaceId) {
    const requestedProfile = profiles.find(p => p.workspaceId === workspaceId);
    if (requestedProfile) {
      targetProfile = requestedProfile;
    }
  }

  // Generate JWT token
  const token = generateToken(user, targetProfile.id, targetProfile.workspaceId, targetProfile.role);

  // Session creation removed

  return {
    user: {
      id: user.id,
      email: user.email,
      name: null, // User model doesn't have name anymore, it's on Profile
      createdAt: user.createdAt,
    },
    token,
    profiles: profiles.map((p) => ({
      id: p.id,
      workspaceId: p.workspaceId,
      role: p.role,
      workspace: {
        id: p.workspace.id,
        name: p.workspace.name,
      },
    })),
    currentProfile: {
      id: targetProfile.id,
      workspaceId: targetProfile.workspaceId,
      role: targetProfile.role,
      workspace: {
        id: targetProfile.workspace.id,
        name: targetProfile.workspace.name,
      },
    },
  };
}

/**
 * Logout user by invalidating session
 */
export async function logout(
  token: string,
  prisma: PrismaClient
): Promise<void> {
  // Stateless logout (client-side only)
  return;
}

/**
 * Switch workspace
 */
export async function switchWorkspace(
  userId: string,
  input: SwitchWorkspaceInput,
  prisma: PrismaClient
): Promise<SwitchWorkspaceResponse> {
  const { workspaceId } = input;

  // Verify user is a member of the workspace
  const profile = await prisma.profile.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
    include: {
      workspace: true,
    },
  });

  if (!profile) {
    throw new AppError("User is not a member of this workspace", 403, "FORBIDDEN");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new AppError("User not found", 404, "USER_NOT_FOUND");
  }

  // Generate new token for the target workspace
  const token = generateToken(user, profile.id, profile.workspaceId, profile.role);

  return {
    token,
    workspace: {
      id: profile.workspace.id,
      name: profile.workspace.name,
    },
    role: profile.role,
  };
}

/**
 * Validate JWT token and return user
 */
export async function validateToken(
  token: string,
  prisma: PrismaClient
): Promise<User | null> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    
    // Check if user exists (optional for stateless, but good for security)
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    return user;
  } catch {
    return null;
  }
}

/**
 * Get current user profile
 */
export async function getCurrentUser(
  userId: string,
  prisma: PrismaClient
): Promise<UserResponse> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new AppError("User not found", 404, "USER_NOT_FOUND");
  }

  return user;
}

/**
 * Get all users (admin only)
 */
export async function getAllUsers(
  prisma: PrismaClient
): Promise<UserResponse[]> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return users;
}

/**
 * Get user by ID
 */
export async function getUserById(
  userId: string,
  prisma: PrismaClient
): Promise<UserResponse> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new AppError("User not found", 404, "USER_NOT_FOUND");
  }

  return user;
}

/**
 * Generate JWT token
 */
/**
 * Generate JWT token
 */
function generateToken(user: User, profileId: string, workspaceId: string, role: Role): string {
  const payload = {
    userId: user.id,
    profileId,
    workspaceId,
    role,
    jti: randomUUID(),
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

/**
 * Create session for user
 */
// createSession removed

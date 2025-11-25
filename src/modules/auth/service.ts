import { PrismaClient, User, Role } from "@prisma/client";
import * as argon2 from "argon2";
import jwt from "jsonwebtoken";
import { AuthResponse, LoginInput, RegisterInput, UserResponse } from "./types";
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
        members: {
          create: {
            userId: user.id,
            role: Role.ADMIN,
          },
        },
      },
    });

    const updatedUser = await tx.user.update({
      where: { id: user.id },
      data: { defaultWorkspaceId: workspace.id },
    });

    return { user: updatedUser, workspace };
  });

  const { user, workspace } = result;

  // Generate JWT token
  const token = generateToken(user, workspace.id);

  // Create session
  await createSession(user.id, token, prisma);

  // Destructure user object for response
  const { id, role, createdAt, defaultWorkspaceId } = user;

  return {
    user: {
      id,
      email,
      name,
      role,
      createdAt,
      defaultWorkspaceId,
    },
    token,
    workspaces: [
      {
        id: workspace.id,
        name: workspace.name,
        role: Role.ADMIN,
      },
    ],
  };
}

/**
 * Login user
 */
export async function login(
  input: LoginInput,
  prisma: PrismaClient
): Promise<AuthResponse> {
  const { email, password } = input;

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

  // Get user's workspaces
  let workspaces = await prisma.workspaceMember.findMany({
    where: { userId: user.id },
    include: { workspace: true },
  });

  let defaultWorkspaceId = user.defaultWorkspaceId;

  // Migration: Create default workspace if none exists
  if (workspaces.length === 0) {
    const workspace = await prisma.workspace.create({
      data: {
        name: `${user.name}'s Workspace`,
        ownerId: user.id,
        members: {
          create: {
            userId: user.id,
            role: Role.ADMIN,
          },
        },
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { defaultWorkspaceId: workspace.id },
    });

    // Refresh workspaces list
    workspaces = await prisma.workspaceMember.findMany({
      where: { userId: user.id },
      include: { workspace: true },
    });
    defaultWorkspaceId = workspace.id;
  }

  // Determine target workspace
  const targetWorkspaceId = defaultWorkspaceId || workspaces[0].workspace.id;

  // Generate JWT token
  const token = generateToken(user, targetWorkspaceId);

  // Create session
  await createSession(user.id, token, prisma);

  // Destructure user object for response
  const {
    id,
    email: userEmail,
    name: userName,
    role: userRole,
    createdAt,
  } = user;

  return {
    user: {
      id,
      email: userEmail,
      name: userName,
      role: userRole,
      createdAt,
      defaultWorkspaceId,
    },
    token,
    workspaces: workspaces.map((w) => ({
      id: w.workspace.id,
      name: w.workspace.name,
      role: w.role,
    })),
  };
}

/**
 * Logout user by invalidating session
 */
export async function logout(
  token: string,
  prisma: PrismaClient
): Promise<void> {
  const deletedSessions = await prisma.session.deleteMany({
    where: { token },
  });

  if (deletedSessions.count === 0) {
    throw new AppError("Invalid or expired token", 401, "INVALID_TOKEN");
  }
}

/**
 * Validate JWT token and return user
 */
export async function validateToken(
  token: string,
  prisma: PrismaClient
): Promise<User | null> {
  try {
    jwt.verify(token, JWT_SECRET) as { userId: string };

    // Check if session exists and is not expired
    const session = await prisma.session.findFirst({
      where: {
        token,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    });

    if (!session) {
      return null;
    }

    return session.user;
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
      role: true,
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
      role: true,
      createdAt: true,
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
      role: true,
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
function generateToken(user: User, workspaceId: string): string {
  const payload = {
    userId: user.id,
    role: user.role,
    workspaceId,
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

/**
 * Create session for user
 */
async function createSession(
  userId: string,
  token: string,
  prisma: PrismaClient
): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

  await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });
}

import { PrismaClient, User, Role } from "@prisma/client";
import * as argon2 from "argon2";
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import {
  AuthResponse,
  LoginInput,
  RegisterInput,
  UserResponse,
  SwitchWorkspaceInput,
  MakeProfileDefaultInput,
} from "./types";
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
            isDefault: true,
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

  const userWithProfile = {
    userId: user.id,
    email: user.email,
    name: name, // Return the name provided during registration
    createdAt: user.createdAt,
    profileId: profile.id,
    workspaceId: workspace.id,
    role: profile.role,
    workspaceName: workspace.name,
  };

  // Generate JWT token
  const token = generateToken(userWithProfile);

  // Session creation removed

  return {
    user: userWithProfile,
    token,
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

  // Get user's profiles
  const {
    id: profileId,
    workspaceId: workspaceId,
    workspace: { name: workspaceName },
    role,
    name,
  } = await prisma.profile.findFirstOrThrow({
    where: { userId: user.id, isDefault: true },
    include: { workspace: true },
  });

  const userWithProfile = {
    userId: user.id,
    email: user.email,
    name,
    profileId: profileId,
    workspaceId: workspaceId,
    role: role,
    workspaceName: workspaceName,
  };

  // Generate JWT token
  const token = generateToken(userWithProfile);

  // Session creation removed

  return {
    user: userWithProfile,
    token,
  };
}

/**
 * Logout user by invalidating session
 */
// export async function logout(
//   token: string,
//   prisma: PrismaClient
// ): Promise<void> {
//   // Stateless logout (client-side only)
//   return;
// }

/**
 * Switch workspace
 */
export async function switchWorkspace(
  userId: string,
  input: SwitchWorkspaceInput,
  prisma: PrismaClient
): Promise<AuthResponse> {
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
      user: true,
      workspace: true,
    },
  });

  if (!profile) {
    throw new AppError(
      "User is not a member of this workspace",
      403,
      "FORBIDDEN"
    );
  }

  const userWithProfile = {
    userId: profile.user.id,
    email: profile.user.email,
    name: profile.name,
    profileId: profile.id,
    workspaceId: profile.workspaceId,
    role: profile.role,
    workspaceName: profile.workspace.name,
  };

  // Generate new token for the target workspace
  const token = generateToken(userWithProfile);

  return {
    token,
    user: userWithProfile,
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
    console.log("decoded", decoded);
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
  profileId: string,
  prisma: PrismaClient
): Promise<UserResponse> {
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    include: {
      user: true,
      workspace: true,
    },
  });

  if (!profile) {
    throw new AppError("User not found", 404, "USER_NOT_FOUND");
  }

  const userWithProfile = {
    userId: profile.userId,
    name: profile.name,
    profileId: profile.id,
    workspaceId: profile.workspaceId,
    role: profile.role,
    email: profile.user.email,
    workspaceName: profile.workspace.name,
  };
  return userWithProfile;
}

/**
 * Get all users (admin only)
 */
export async function getAllUsers(
  workspaceId: string,
  prisma: PrismaClient
): Promise<UserResponse[]> {
  const users = await prisma.profile.findMany({
    where: { workspaceId },
    include: {
      user: true,
      workspace: true,
    },
  });

  return users.map((profile) => ({
    userId: profile.userId,
    email: profile.user.email,
    name: profile.name,
    profileId: profile.id,
    workspaceId: profile.workspaceId,
    role: profile.role,
    workspaceName: profile.workspace.name,
  }));
}

/**
 * Get user by ID
 */
export async function getUserById(
  profileId: string,
  workspaceId: string,
  prisma: PrismaClient
): Promise<UserResponse> {
  const profile = await prisma.profile.findUnique({
    where: { id: profileId, workspaceId },
    include: {
      user: true,
      workspace: true,
    },
  });

  if (!profile) {
    throw new AppError("User not found", 404, "USER_NOT_FOUND");
  }

  const userWithProfile = {
    userId: profile.userId,
    email: profile.user.email,
    name: profile.name,
    profileId: profile.id,
    workspaceId: profile.workspaceId,
    role: profile.role,
    workspaceName: profile.workspace.name,
  };
  return userWithProfile;
}

/**
 * Generate JWT token
 */
/**
 * Generate JWT token
 */
function generateToken(user: UserResponse): string {
  const payload = {
    ...user,
    jti: randomUUID(),
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

/**
 * Make a profile default for a user
 */
export async function makeProfileDefault(
  userId: string,
  input: MakeProfileDefaultInput,
  prisma: PrismaClient
): Promise<void> {
  const { workspaceId } = input;

  // Verify the profile exists and belongs to the user
  const profile = await prisma.profile.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
  });

  if (!profile) {
    throw new AppError("Profile not found", 404, "PROFILE_NOT_FOUND");
  }

  // Update all profiles for this user: set isDefault to false
  // Then set the specified profile to isDefault: true
  await prisma.$transaction(async (tx) => {
    // Set all profiles for this user to isDefault: false
    await tx.profile.updateMany({
      where: { userId },
      data: { isDefault: false },
    });

    // Set the specified profile to isDefault: true
    await tx.profile.update({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      data: { isDefault: true },
    });
  });
}

/**
 * Create session for user
 */
// createSession removed

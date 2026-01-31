import { PrismaClient, User, Role } from "@prisma/client";
import * as argon2 from "argon2";
import { randomUUID, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { AppError } from "../../plugins/error/plugin";
import { sendVerificationEmail as sendEmail } from "../../services/email-service";

import type {
  AuthResponse,
  LoginInput,
  RegisterInput,
  UserResponse,
  SwitchWorkspaceInput,
  MakeProfileDefaultInput,
} from "./types";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const JWT_EXPIRES_IN = "7d";
const EMAIL_VERIFICATION_TOKEN_EXPIRY =
  parseInt(process.env.EMAIL_VERIFICATION_TOKEN_EXPIRY || "24", 10) * 60 * 60 * 1000; // Convert hours to milliseconds

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
    name: user.name,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    profileId: profile.id,
    workspaceId: workspace.id,
    role: profile.role as Role,
    workspaceName: workspace.name,
  };

  // Generate JWT token
  const token = generateToken(userWithProfile);

  // Session creation removed

  // Send verification email
  try {
    const verificationToken = await generateVerificationToken(user.id, prisma);
    await sendVerificationEmail(user.email, user.name, verificationToken);
  } catch (error) {
    // Log error but don't fail registration if email fails
    console.error("Failed to send verification email:", error);
  }

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
    workspaceId,
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
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
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
    emailVerified: profile.user.emailVerified,
    createdAt: profile.user.createdAt,
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
    emailVerified: profile.user.emailVerified,
    createdAt: profile.user.createdAt,
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
    role: profile.role as Role,
    emailVerified: profile.user.emailVerified,
    createdAt: profile.user.createdAt,
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
    emailVerified: profile.user.emailVerified,
    createdAt: profile.user.createdAt,
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

/**
 * Generate a secure verification token
 */
async function generateVerificationToken(
  userId: string,
  prisma: PrismaClient
): Promise<string> {
  // Generate cryptographically secure random token (64 characters)
  const token = randomBytes(32).toString("hex");

  // Calculate expiration time
  const expiresAt = new Date();
  expiresAt.setTime(expiresAt.getTime() + EMAIL_VERIFICATION_TOKEN_EXPIRY);

  // Store token in database
  await prisma.userVerification.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });

  return token;
}

/**
 * Send verification email to user
 */
async function sendVerificationEmail(
  userEmail: string,
  userName: string,
  token: string
): Promise<void> {
  await sendEmail(userEmail, userName, token);
}

/**
 * Verify email verification token and mark user's email as verified.
 * 
 * This function validates a verification token for email verification. It performs
 * the following checks:
 * - Verifies the user exists
 * - Checks if the email is already verified (returns early if so)
 * - Validates the token matches the user and exists in the database
 * - Checks if the token has expired
 * 
 * If the token is expired, it automatically generates a new token and sends
 * a new verification email to the user. If the token is valid, it marks the
 * user's email as verified and deletes the token (ensuring single-use).
 * 
 * @param {string} token - The verification token to validate
 * @param {string} userId - The ID of the user whose email is being verified
 * @param {PrismaClient} prisma - Prisma client instance for database operations
 * 
 * @returns {Promise<{emailVerified: boolean; message: string}>} An object containing:
 *   - `emailVerified`: Boolean indicating if the email was verified (true) or if
 *     the token was expired and a new email was sent (false)
 *   - `message`: Human-readable message describing the result
 * 
 * @throws {AppError} Throws an error with code "USER_NOT_FOUND" (404) if the user
 *   does not exist
 * @throws {AppError} Throws an error with code "INVALID_VERIFICATION_TOKEN" (400)
 *   if the token is invalid or doesn't match the user
 */
export async function verifyEmailToken(
  token: string,
  userId: string,
  prisma: PrismaClient
): Promise<{ emailVerified: boolean; message: string }> {
  // First check if user is already verified
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true },
  });

  if (!user) {
    throw new AppError("User not found", 404, "USER_NOT_FOUND");
  }

  if (user.emailVerified) {
    return {
      emailVerified: true,
      message: "Email already verified",
    };
  }

  // Find token in database matching both token AND userId
  const verificationToken = await prisma.userVerification.findFirst({
    where: {
      token,
      userId,
    },
  });

  if (!verificationToken) {
    throw new AppError(
      "Invalid verification token",
      400,
      "INVALID_VERIFICATION_TOKEN"
    );
  }

  // Check if token is expired
  const now = new Date();
  if (verificationToken.expiresAt <= now) {
    // Delete expired token
    await prisma.userVerification.delete({
      where: { id: verificationToken.id },
    });

    // Generate new token
    const newToken = await generateVerificationToken(userId, prisma);

    // Get user details for email
    const userDetails = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (userDetails) {
      // Send new verification email
      await sendVerificationEmail(
        userDetails.email,
        userDetails.name,
        newToken
      );
    }

    return {
      emailVerified: false,
      message: "Verification token has expired. A new verification email has been sent.",
    };
  }

  // Token is valid and not expired - verify email
  await prisma.user.update({
    where: { id: userId },
    data: { emailVerified: true },
  });

  // Delete token record immediately (ensures single-use)
  await prisma.userVerification.delete({
    where: { id: verificationToken.id },
  });

  return {
    emailVerified: true,
    message: "Email verified successfully!",
  };
}

/**
 * Resend verification email to the user.
 * 
 * This function sends a verification email to a user who hasn't verified their
 * email yet. The function performs the following steps:
 * - Checks if the user exists
 * - Returns early if the user's email is already verified (no email sent)
 * - Deletes any existing verification tokens for the user
 * - Generates a new verification token
 * - Sends the verification email with the new token
 * 
 * Note: This function always generates a fresh token, invalidating any previous
 * verification tokens the user may have had.
 * 
 * @param {string} userId - The ID of the user to send the verification email to
 * @param {PrismaClient} prisma - Prisma client instance for database operations
 * 
 * @returns {Promise<void>} Resolves when the email has been sent successfully
 * 
 * @throws {AppError} Throws an error with code "USER_NOT_FOUND" (404) if the
 *   user does not exist
 */
export async function resendVerificationEmail(
  userId: string,
  prisma: PrismaClient
): Promise<void> {
  // Check if user is already verified
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true, email: true, name: true },
  });

  if (!user) {
    throw new AppError("User not found", 404, "USER_NOT_FOUND");
  }

  if (user.emailVerified) {
    // User already verified, no need to resend
    return;
  }

  // Delete any existing tokens for this user
  await prisma.userVerification.deleteMany({
    where: { userId },
  });

  // Generate new token
  const token = await generateVerificationToken(userId, prisma);

  // Send verification email
  await sendVerificationEmail(user.email, user.name, token);
}

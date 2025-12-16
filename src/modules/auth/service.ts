import { PrismaClient, User } from "@prisma/client";
import * as argon2 from "argon2";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { AuthResponse, LoginInput, RegisterInput, UserResponse } from "./types";
import { AppError } from "../../plugins/error/plugin";
import { sendVerificationEmail as sendEmail } from "../../services/email-service";

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

  // Create user
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name,
    },
  });

  // Generate JWT token
  const token = generateToken(user);

  // Create session
  await createSession(user.id, token, prisma);

  // Send verification email
  try {
    const verificationToken = await generateVerificationToken(user.id, prisma);
    await sendVerificationEmail(user.email, user.name, verificationToken);
  } catch (error) {
    // Log error but don't fail registration if email fails
    console.error("Failed to send verification email:", error);
  }

  // Destructure user object for response
  const { id, role, createdAt, emailVerified } = user;

  return {
    user: {
      id,
      email,
      name,
      role,
      emailVerified,
      createdAt,
    },
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

  // Generate JWT token
  const token = generateToken(user);

  // Create session
  await createSession(user.id, token, prisma);

  // Destructure user object for response
  const {
    id,
    email: userEmail,
    name: userName,
    role: userRole,
    createdAt,
    emailVerified,
  } = user;

  return {
    user: {
      id,
      email: userEmail,
      name: userName,
      role: userRole,
      emailVerified,
      createdAt,
    },
    token,
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
      emailVerified: true,
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
      emailVerified: true,
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
      emailVerified: true,
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
function generateToken(user: User): string {
  const payload = {
    userId: user.id,
    role: user.role,
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

/**
 * Generate a secure verification token
 */
async function generateVerificationToken(
  userId: string,
  prisma: PrismaClient
): Promise<string> {
  // Generate cryptographically secure random token (64 characters)
  const token = crypto.randomBytes(32).toString("hex");

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

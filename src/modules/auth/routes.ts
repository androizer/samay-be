import { FastifyPluginAsync } from "fastify";
import rateLimit from "@fastify/rate-limit";
import {
  LOGIN_SCHEMA,
  REGISTER_SCHEMA,
  GET_USER_BY_ID_SCHEMA,
  VERIFY_EMAIL_TOKEN_SCHEMA,
} from "./schema";
import {
  register,
  login,
  logout,
  getCurrentUser,
  getAllUsers,
  getUserById,
  verifyEmailToken,
  resendVerificationEmail,
} from "./service";
import { ZodTypeProvider } from "fastify-type-provider-zod";

const authRoutes: FastifyPluginAsync = async (fastify) => {
  const prisma = fastify.prisma;
  // Register user

  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/register",
    schema: {
      body: REGISTER_SCHEMA,
    },
    handler: async (request, reply) => {
      const input = request.body;
      const result = await register(input, prisma);

      return reply.status(201).send({
        data: result,
      });
    },
  });

  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/login",
    schema: {
      body: LOGIN_SCHEMA,
    },
    handler: async (request, reply) => {
      const input = request.body;
      const result = await login(input, prisma);

      return reply.send({
        data: result,
      });
    },
  });

  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/logout",
    handler: async (request, reply) => {
      const authHeader = request.headers.authorization || "";
      const token = authHeader.split(" ")[1];
      await logout(token, prisma);

      return reply.send({
        message: "Logged out successfully",
      });
    },
  });

  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/me",
    handler: async (request, reply) => {
      const { userId = "" } = request.user || {};
      const user = await getCurrentUser(userId, prisma);
      return reply.send({
        data: user,
      });
    },
  });

  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/users",
    handler: async (request, reply) => {
      const users = await getAllUsers(prisma);
      return reply.send({
        data: users,
      });
    },
  });

  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/users/:id",
    schema: {
      params: GET_USER_BY_ID_SCHEMA,
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const user = await getUserById(id, prisma);
      return reply.send({
        data: user,
      });
    },
  });

  // Send verification email endpoint
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/send-verification-email",
    handler: async (request, reply) => {
      const { userId = "" } = request.user || {};
      await resendVerificationEmail(userId, prisma);
      return reply.send({
        message: "Verification email sent successfully",
      });
    },
  });

  // Verify email endpoint (requires auth)
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/verify-email",
    schema: {
      body: VERIFY_EMAIL_TOKEN_SCHEMA,
    },
    handler: async (request, reply) => {
      const { userId = "" } = request.user || {};
      const { token } = request.body;
      const result = await verifyEmailToken(token, userId, prisma);
      return reply.send({
        message: result.message,
        emailVerified: result.emailVerified,
      });
    },
  });

  // Resend verification email endpoint with rate limiting
  await fastify.register(async (fastify) => {
    await fastify.register(rateLimit, {
      max: 3,
      timeWindow: "1 hour",
      keyGenerator: (request) => {
        const { userId = "" } = request.user || {};
        return `resend-verification-${userId}`;
      },
      errorResponseBuilder: () => {
        return {
          error: "Too many verification email requests. Please try again later.",
        };
      },
    });

    fastify.withTypeProvider<ZodTypeProvider>().route({
      method: "POST",
      url: "/resend-verification-email",
      handler: async (request, reply) => {
        const { userId = "" } = request.user || {};
        await resendVerificationEmail(userId, prisma);
        return reply.send({
          message: "Verification email sent successfully",
        });
      },
    });
  });
};

export default authRoutes;

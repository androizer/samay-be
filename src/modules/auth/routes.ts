import rateLimit from "@fastify/rate-limit";
import {
  LOGIN_SCHEMA,
  REGISTER_SCHEMA,
  GET_USER_BY_ID_SCHEMA,
  SWITCH_WORKSPACE_SCHEMA,
  MAKE_PROFILE_DEFAULT_SCHEMA,
  VERIFY_EMAIL_TOKEN_SCHEMA,
} from "./schema";
import {
  register,
  login,
  // logout,
  getCurrentUser,
  getAllUsers,
  getUserById,
  switchWorkspace,
  makeProfileDefault,
  verifyEmailToken,
  resendVerificationEmail,
} from "./service";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

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
    url: "/switch-workspace",
    schema: {
      body: SWITCH_WORKSPACE_SCHEMA,
    },
    handler: async (request, reply) => {
      const { userId = "" } = request.user || {};
      const input = request.body;
      const result = await switchWorkspace(userId, input, prisma);

      return reply.send({
        data: result,
      });
    },
  });

  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/me",
    handler: async (request, reply) => {
      const { profileId = "" } = request.user || {};
      const user = await getCurrentUser(profileId, prisma);
      return reply.send({
        data: user,
      });
    },
  });

  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/users",
    handler: async (request, reply) => {
      const { workspaceId = "" } = request.user || {};
      const users = await getAllUsers(workspaceId, prisma);
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
      const { workspaceId = "" } = request.user || {};
      const user = await getUserById(id, workspaceId, prisma);
      return reply.send({
        data: user,
      });
    },
  });

  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/make-profile-default",
    schema: {
      body: MAKE_PROFILE_DEFAULT_SCHEMA,
    },
    handler: async (request, reply) => {
      const { userId = "" } = request.user || {};
      const input = request.body;
      await makeProfileDefault(userId, input, prisma);
      return reply.status(200).send({
        message: "Profile set as default successfully",
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

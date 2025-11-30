import { FastifyPluginAsync } from "fastify";
import { LOGIN_SCHEMA, REGISTER_SCHEMA, GET_USER_BY_ID_SCHEMA, SWITCH_WORKSPACE_SCHEMA } from "./schema";
import {
  register,
  login,
  logout,
  getCurrentUser,
  getAllUsers,
  getUserById,
  switchWorkspace,
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
};

export default authRoutes;

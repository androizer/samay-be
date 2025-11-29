import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  CREATE_WORKSPACE_SCHEMA,
  UPDATE_WORKSPACE_SCHEMA,
  WORKSPACE_ID_PARAM_SCHEMA,
} from "./schema";
import {
  createWorkspace,
  getWorkspaces,
  updateWorkspace,
  deleteWorkspace,
} from "./service";

const workspaceRoutes: FastifyPluginAsync = async (fastify) => {
  const prisma = fastify.prisma;

  // Create workspace
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/",
    schema: {
      body: CREATE_WORKSPACE_SCHEMA,
    },
    handler: async (request, reply) => {
      const { userId = "" } = request.user || {};
      const input = request.body;
      const result = await createWorkspace(prisma, input, userId);

      return reply.status(201).send({
        data: result,
        message: "Workspace created successfully",
      });
    },
  });

  // Get all workspaces
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/",
    handler: async (request, reply) => {
      const { userId = "" } = request.user || {};
      const result = await getWorkspaces(prisma, userId);

      return reply.send({
        data: result,
      });
    },
  });

  // Update workspace
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "PUT",
    url: "/:id",
    schema: {
      params: WORKSPACE_ID_PARAM_SCHEMA,
      body: UPDATE_WORKSPACE_SCHEMA,
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const { userId = "", role } = request.user || {};

      if (role !== "ADMIN") {
        return reply.status(403).send({ message: "Only admins can update workspaces" });
      }

      const input = request.body;
      const result = await updateWorkspace(prisma, id, input, userId);

      return reply.send({
        data: result,
        message: "Workspace updated successfully",
      });
    },
  });

  // Delete workspace
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "DELETE",
    url: "/:id",
    schema: {
      params: WORKSPACE_ID_PARAM_SCHEMA,
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const { role } = request.user || {};

      if (role !== "ADMIN") {
        return reply.status(403).send({ message: "Only admins can delete workspaces" });
      }

      await deleteWorkspace(prisma, id);

      return reply.send({
        message: "Workspace deleted successfully",
      });
    },
  });
};

export default workspaceRoutes;

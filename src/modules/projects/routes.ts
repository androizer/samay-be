import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  CREATE_PROJECT_SCHEMA,
  UPDATE_PROJECT_SCHEMA,
  PROJECT_ID_PARAM_SCHEMA,
  ADD_USERS_TO_PROJECT_SCHEMA,
  DELETE_USERS_FROM_PROJECT_PARAM_SCHEMA,
} from "./schema";
import {
  createProject,
  getProjects,
  getProject,
  updateProject,
  deleteProject,
  addUsersToProject,
  deleteUsersFromProject,
} from "./service";

const projectRoutes: FastifyPluginAsync = async (fastify) => {
  const prisma = fastify.prisma;

  // Create project
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/",
    schema: {
      body: CREATE_PROJECT_SCHEMA,
    },
    handler: async (request, reply) => {
      const { workspaceId = "" } = request.user || {};
      const input = request.body;
      const result = await createProject(prisma, input, workspaceId);

      return reply.status(201).send({
        data: result,
        message: "Project created successfully",
      });
    },
  });

  // Get all projects with pagination and search
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/",
    handler: async (request, reply) => {
      const { userId = "", role = "", workspaceId = "" } = request.user || {};
      const result = await getProjects(prisma, userId, workspaceId, role == "ADMIN");

      return reply.send({
        data: result,
      });
    },
  });

  // Get single project by ID
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/:id",
    schema: {
      params: PROJECT_ID_PARAM_SCHEMA,
    },
    handler: async (request, reply) => {
      const { userId = "", role = "", workspaceId = "" } = request.user || {};
      const { id } = request.params;
      const projectId = parseInt(id);

      const result = await getProject(
        prisma,
        userId,
        workspaceId,
        role == "ADMIN",
        projectId
      );

      return reply.send({
        data: result,
      });
    },
  });

  // Update project
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "PUT",
    url: "/:id",
    schema: {
      params: PROJECT_ID_PARAM_SCHEMA,
      body: UPDATE_PROJECT_SCHEMA,
    },
    handler: async (request, reply) => {
      const { workspaceId = "" } = request.user || {};
      const { id } = request.params;
      const projectId = parseInt(id);

      const input = request.body;

      const result = await updateProject(prisma, projectId, workspaceId, input);
      return reply.send({
        data: result,
        message: "Project updated successfully",
      });
    },
  });

  // Delete project
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "DELETE",
    url: "/:id",
    schema: {
      params: PROJECT_ID_PARAM_SCHEMA,
    },
    handler: async (request, reply) => {
      const { workspaceId = "" } = request.user || {};
      const { id } = request.params;
      const projectId = parseInt(id);

      await deleteProject(prisma, projectId, workspaceId);
      return reply.send({
        message: "Project deleted successfully",
      });
    },
  });

  // Add users to project
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/:id/users",
    schema: {
      params: PROJECT_ID_PARAM_SCHEMA,
      body: ADD_USERS_TO_PROJECT_SCHEMA,
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const projectId = parseInt(id);
      const input = request.body;

      await addUsersToProject(prisma, projectId, input);
      return reply.send({
        message: "Users added to project successfully",
      });
    },
  });

  // Delete users from project
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "DELETE",
    url: "/:id/users/:userId",
    schema: {
      params: DELETE_USERS_FROM_PROJECT_PARAM_SCHEMA,
    },
    handler: async (request, reply) => {
      const { id, userId } = request.params;
      const projectId = parseInt(id);

      await deleteUsersFromProject(prisma, projectId, userId);
      return reply.send({
        message: "Users removed from project successfully",
      });
    },
  });
};

export default projectRoutes;

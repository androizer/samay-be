import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import {
  CREATE_WORKSPACE_SCHEMA,
  UPDATE_WORKSPACE_SCHEMA,
  WORKSPACE_ID_PARAM_SCHEMA,
  DELETE_USER_SCHEMA,
  CREATE_INVITATION_SCHEMA,
  ACCEPT_INVITATION_SCHEMA,
  INVITATION_QUERY_SCHEMA,
} from "./schema";
import {
  createWorkspace,
  getWorkspaces,
  updateWorkspace,
  deleteWorkspace,
  inviteUserToWorkspace,
  deleteUserFromWorkspace,
  createInvitation,
  acceptInvitation,
  getPendingInvitations,
  deleteInvitation,
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
      const { userId = "" } = request.user || {};

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
      const { userId = "" } = request.user || {};
      await deleteWorkspace(prisma, id, userId);

      return reply.send({
        message: "Workspace deleted successfully",
      });
    },
  });

  // Invite user to workspace (admin only)
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/:id/invite",
    schema: {
      params: WORKSPACE_ID_PARAM_SCHEMA,
      body: CREATE_INVITATION_SCHEMA,
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const { userId = "" } = request.user || {};
      const input = request.body;
      const result = await inviteUserToWorkspace(prisma, id, input, userId);

      return reply.status(201).send({
        data: result,
        message: "User invited successfully",
      });
    },
  });

  // Delete user from workspace (admin only)
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "DELETE",
    url: "/:id/users",
    schema: {
      params: WORKSPACE_ID_PARAM_SCHEMA,
      body: DELETE_USER_SCHEMA,
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const { userId = "" } = request.user || {};
      const input = request.body;
      await deleteUserFromWorkspace(prisma, id, input, userId);

      return reply.send({
        message: "User removed from workspace successfully",
      });
    },
  });

  // Invitation routes

  // Create invitation
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/:id/invitations",
    schema: {
      params: WORKSPACE_ID_PARAM_SCHEMA,
      body: CREATE_INVITATION_SCHEMA,
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const { userId = "" } = request.user || {};
      const input = request.body;
      const result = await createInvitation(prisma, input, userId, id);

      return reply.status(201).send({
        data: result,
        message: "Invitation sent successfully",
      });
    },
  });

  // Accept invitation (logged-in users only)
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/invitations/accept",
    schema: {
      body: ACCEPT_INVITATION_SCHEMA,
    },
    handler: async (request, reply) => {
      const { userId = "" } = request.user || {};
      const input = request.body;
      const result = await acceptInvitation(prisma, input, userId);

      return reply.send({
        data: result,
        message: "Invitation accepted successfully",
      });
    },
  });

  // Get pending invitations for a workspace
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/:id/invitations",
    schema: {
      params: WORKSPACE_ID_PARAM_SCHEMA,
      querystring: INVITATION_QUERY_SCHEMA,
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const query = request.query;
      const result = await getPendingInvitations(prisma, id, query);

      return reply.send({
        data: result,
      });
    },
  });

  // Delete invitation
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "DELETE",
    url: "/:workspaceId/invitations/:id",
    schema: {
      params: z.object({
        workspaceId: z.string().min(1, "Workspace ID is required"),
        id: z.string().min(1, "Invitation ID is required"),
      }),
    },
    handler: async (request, reply) => {
      const { workspaceId, id } = request.params;
      await deleteInvitation(prisma, id, workspaceId);

      return reply.send({
        message: "Invitation deleted successfully",
      });
    },
  });
};

export default workspaceRoutes;

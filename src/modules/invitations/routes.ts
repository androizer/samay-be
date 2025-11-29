import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  CREATE_INVITATION_SCHEMA,
  ACCEPT_INVITATION_SCHEMA,
  INVITATION_QUERY_SCHEMA,
} from "./schema";
import {
  createInvitation,
  acceptInvitation,
  getPendingInvitations,
  deleteInvitation,
} from "./service";
import z from "zod";

const invitationRoutes: FastifyPluginAsync = async (fastify) => {
  const prisma = fastify.prisma;

  // Create invitation
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/",
    schema: {
      body: CREATE_INVITATION_SCHEMA,
    },
    handler: async (request, reply) => {
      const { userId = "", workspaceId = "" } = request.user || {};
      // TODO: Check if user is admin of workspace.
      // Assuming middleware checks role or we check here.
      // request.user.role is global role? No, it's profile role from token.
      
      const { role } = request.user || {};
      if (role !== "ADMIN") {
        return reply.status(403).send({ message: "Only admins can invite users" });
      }

      const input = request.body;
      const result = await createInvitation(prisma, input, userId, workspaceId);

      return reply.status(201).send({
        data: result,
        message: "Invitation sent successfully",
      });
    },
  });

  // Accept invitation
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/accept",
    schema: {
      body: ACCEPT_INVITATION_SCHEMA,
    },
    handler: async (request, reply) => {
      const input = request.body;
      const result = await acceptInvitation(prisma, input);

      return reply.send({
        data: result,
        message: "Invitation accepted successfully",
      });
    },
  });

  // Get pending invitations
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/",
    schema: {
      querystring: INVITATION_QUERY_SCHEMA,
    },
    handler: async (request, reply) => {
      const { workspaceId = "", role } = request.user || {};
      
      if (role !== "ADMIN") {
        return reply.status(403).send({ message: "Only admins can view invitations" });
      }

      const query = request.query;
      const result = await getPendingInvitations(prisma, workspaceId, query);

      return reply.send({
        data: result,
      });
    },
  });

  // Delete invitation
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "DELETE",
    url: "/:id",
    schema: {
      params: z.object({
        id: z.string().min(1, "Invitation ID is required"),
      }),
    },
    handler: async (request, reply) => {
      const { workspaceId = "", role } = request.user || {};

      if (role !== "ADMIN") {
        return reply.status(403).send({ message: "Only admins can delete invitations" });
      }

      const { id } = request.params;
      await deleteInvitation(prisma, id, workspaceId);

      return reply.send({
        message: "Invitation deleted successfully",
      });
    },
  });
};

export default invitationRoutes;

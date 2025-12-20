import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  CREATE_ACTIVITY_SCHEMA,
  UPDATE_ACTIVITY_SCHEMA,
  ACTIVITY_ID_PARAM_SCHEMA,
  ACTIVITIES_QUERY_SCHEMA,
  TOP_ACTIVITIES_QUERY_SCHEMA,
  SELECT_ACTIVITIES_SCHEMA,
  ADD_PROJECT_SCHEMA,
  USER_SELECT_DATA_QUERY_SCHEMA,
} from "./schema";
import {
  createActivity,
  getActivities,
  updateActivity,
  deleteActivity,
  getActivityStats,
  getTopApps,
  getTopActivities,
  selectActivities,
  activitiesForSelection,
  addActivitiesToProject,
  getUserSelectData,
} from "./service";
import z from "zod";

const activityRoutes: FastifyPluginAsync = async (fastify) => {
  const prisma = fastify.prisma;

  // Create activity
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/",
    schema: {
      body: z.array(CREATE_ACTIVITY_SCHEMA),
    },
    handler: async (request, reply) => {
      const { profileId = "" } = request.user || {};
      const input = request.body;
      await createActivity(input, profileId, prisma);

      return reply.status(201).send({
        message: "Activities created successfully",
      });
    },
  });

  // Get all activities with pagination and filtering
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/",
    schema: {
      querystring: ACTIVITIES_QUERY_SCHEMA,
    },
    handler: async (request, reply) => {
      const { profileId = "" } = request.user || {};
      const query = request.query;
      const result = await getActivities(profileId, query, prisma);

      return reply.send({
        data: result,
      });
    },
  });

  // Get activity statistics
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/stats",
    handler: async (request, reply) => {
      const { profileId = "" } = request.user || {};
      const result = await getActivityStats(profileId, prisma);

      return reply.send({
        data: result,
      });
    },
  });

  // Get activity statistics by day
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/top-apps",
    schema: {
      querystring: TOP_ACTIVITIES_QUERY_SCHEMA,
    },
    handler: async (request, reply) => {
      const { profileId = "" } = request.user || {};
      const query = request.query;
      const result = await getTopApps(profileId, query, prisma);

      return reply.send({
        data: result,
      });
    },
  });

  // Get top activities grouped by app and title
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/top",
    schema: {
      querystring: TOP_ACTIVITIES_QUERY_SCHEMA,
    },
    handler: async (request, reply) => {
      const { profileId = "" } = request.user || {};
      const query = request.query;
      const result = await getTopActivities(profileId, query, prisma);

      return reply.send({
        data: result,
      });
    },
  });

  // Update activity
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "PUT",
    url: "/:id",
    schema: {
      params: ACTIVITY_ID_PARAM_SCHEMA,
      body: UPDATE_ACTIVITY_SCHEMA,
    },
    handler: async (request, reply) => {
      const { profileId = "" } = request.user || {};
      const { id } = request.params;
      const input = request.body;
      const result = await updateActivity(id, input, profileId, prisma);

      return reply.send({
        data: result,
      });
    },
  });

  // Delete activity
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "DELETE",
    url: "/:id",
    schema: {
      params: ACTIVITY_ID_PARAM_SCHEMA,
    },
    handler: async (request, reply) => {
      const { profileId = "" } = request.user || {};
      const { id } = request.params;
      await deleteActivity(id, profileId, prisma);

      return reply.send({
        message: "Activity deleted successfully",
      });
    },
  });

  // Select activities
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/select",
    schema: {
      body: SELECT_ACTIVITIES_SCHEMA,
    },
    handler: async (request, reply) => {
      const { profileId = "" } = request.user || {};
      const { activityIds, selected } = request.body;
      // TODO: Assign project to activities
      await selectActivities(activityIds, profileId, prisma, selected);

      return reply.send({
        message: "Activities selected successfully",
      });
    },
  });

  // Select activities
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/for-user-select",
    schema: {
      querystring: ACTIVITIES_QUERY_SCHEMA,
    },
    handler: async (request, reply) => {
      const { profileId = "" } = request.user || {};
      const { startDate = "", endDate = "" } = request.query;
      const result = await activitiesForSelection(
        profileId,
        prisma,
        startDate,
        endDate
      );

      return reply.send({
        data: result,
      });
    },
  });

  // Add activities to project
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/add-project",
    schema: {
      body: ADD_PROJECT_SCHEMA,
    },
    handler: async (request, reply) => {
      const { profileId = "" } = request.user || {};
      const { activityIds, projectId } = request.body;

      try {
        await addActivitiesToProject(activityIds, projectId, profileId, prisma);

        return reply.send({
          message: "Activities added to project successfully",
        });
      } catch (error) {
        return reply.status(400).send({
          error:
            error instanceof Error
              ? error.message
              : "Failed to add activities to project",
        });
      }
    },
  });

  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/user-select",
    schema: {
      querystring: USER_SELECT_DATA_QUERY_SCHEMA,
    },
    handler: async (request, reply) => {
      const { profileId = "" } = request.user || {};
      const { startDate, endDate } = request.query;

      const result = await getUserSelectData(
        profileId,
        { startDate, endDate },
        prisma
      );

      return reply.send({ data: result });
    },
  });

  // Get user select data by user ID
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/user-select/:userId",
    schema: {
      params: z.object({
        userId: z.string().min(1, "User ID is required"),
      }),
      querystring: USER_SELECT_DATA_QUERY_SCHEMA,
    },
    handler: async (request, reply) => {
      const { userId } = request.params;
      const { workspaceId = "" } = request.user || {}; 
      
      const profile = await prisma.profile.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId,
          },
        },
      });

      if (!profile) {
        return reply.status(404).send({ message: "User not found in workspace" });
      }

      const { startDate, endDate } = request.query;

      const result = await getUserSelectData(
        profile.id,
        { startDate, endDate },
        prisma
      );

      return reply.send({
        data: result,
      });
    },
  });
};

export default activityRoutes;

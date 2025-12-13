import { FastifyInstance } from "fastify";
import { getDailyInsightSchema } from "./schema";
import { getDailyInsight } from "./service";

export default async function insightRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/",
    {
      schema: getDailyInsightSchema,
    },
    async (request, reply) => {
      const { date } = request.query as { date?: string };
      const { profileId = "" } = request.user || {};

      const insight = await getDailyInsight(fastify, profileId, date);

      return reply.send({
        data: {
          dailyInsights: insight?.dailyInsights || [],
          improvementPlan: insight?.improvementPlan || [],
          date: insight?.date.toISOString() || "",
        },
      });
    }
  );
}

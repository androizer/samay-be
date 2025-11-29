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

      if (!insight) {
        return reply.status(404).send({ message: "No insights found for this date" });
      }

      return {data:{
        dailyInsights: insight.dailyInsights,
        improvementPlan: insight.improvementPlan,
        date: insight.date.toISOString(),
      }};
    }
  );
}

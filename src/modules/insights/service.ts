import { FastifyInstance } from "fastify";

export async function getDailyInsight(
  fastify: FastifyInstance,
  profileId: string,
  date?: string
) {
  const targetDate = date ? new Date(date) : new Date();
  
  // If no date provided, default to yesterday (since insights are for yesterday)
  // But if user asks for "today" (via UI default), they might mean "latest available" or "yesterday's data"
  // The cron job runs at 00:01 for the previous day. 
  // Let's assume if date is not provided, we look for the latest insight or specifically yesterday.
  // Given the UI usually shows "Daily Insights", it often implies "Latest".
  // However, to be precise, let's look for the insight record that matches the requested date.
  // If date is NOT provided, we default to yesterday because that's when the insight was generated FOR.
  
  if (!date) {
    targetDate.setDate(targetDate.getDate() - 1);
  }

  // Set time range for the entire day
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  const insight = await fastify.prisma.dailyInsight.findFirst({
    where: {
      profileId,
      date: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return insight;
}

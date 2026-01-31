import Fastify from "fastify";
import fastifySwagger from "@fastify/swagger";
import cors from "@fastify/cors";
import fastifySwaggerUI from "@fastify/swagger-ui";
import fastifySchedule from "@fastify/schedule";
import rateLimit from "@fastify/rate-limit";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import prismaPlugin from "./plugins/prisma-plugin";
import errorHandlerPlugin from "./plugins/error/plugin";
import authMiddleware from "./plugins/auth/auth";
import authRoutes from "./modules/auth/routes";
import activityRoutes from "./modules/activities/routes";
import { createEventsMergeJob } from "./plugins/cron/events-merge";
import projectRoutes from "./modules/projects/routes";
import insightRoutes from "./modules/insights/routes";
import workspaceRoutes from "./modules/workspaces/routes";
import { createTaggingJob } from "./plugins/cron/tagging";
import { createDailyInsightsJob } from "./plugins/cron/daily-insights";
const app = Fastify({
  logger: true,
});

app.register(cors, {
  origin: "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

app.register(prismaPlugin);
app.register(errorHandlerPlugin);
app.register(fastifySchedule);
app.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
});
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.register(fastifySwagger, {
  openapi: {
    info: {
      title: "Samay backend API",
      description: "This is the API documentation for the Samay backend.",
      version: "1.0.0",
    },
    servers: [],
    security: [
      {
        bearerAuth: [],
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      },
    },
  },
  transform: jsonSchemaTransform,
});

app.register(fastifySwaggerUI, {
  routePrefix: "/docs",
});
app.register(authMiddleware);

// Register routes
app.register(authRoutes, { prefix: "/auth" });
app.register(activityRoutes, { prefix: "/activities" });
app.register(projectRoutes, { prefix: "/projects" });
app.register(insightRoutes, { prefix: "/insights" });
app.register(workspaceRoutes, { prefix: "/workspaces" });

app.get("/", async function handler() {
  return "Tick Tick Track your activity without fuss";
});

app.get("/health", async function handler() {
  return { message: "App is Strong and healthy 🚀" };
});

app.listen({ port: parseInt(process.env.PORT || "3000") }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});

app.ready().then(() => {
  console.log("App is ready");
  const eventsMergeJob = createEventsMergeJob(app);
  app.scheduler.addCronJob(eventsMergeJob);
  const taggingJob = createTaggingJob(app);
  app.scheduler.addCronJob(taggingJob);
  const dailyInsightsJob = createDailyInsightsJob(app);
  app.scheduler.addCronJob(dailyInsightsJob);
});

import fp from "fastify-plugin";
import { FastifyPluginAsync } from "fastify";
import { publicRoutes, isAdminRoute } from "./routes";
import { validateToken } from "../../modules/auth/service";
import { JWTPayload } from "./types";
import { AppError, AuthorizationError } from "../error/plugin";

declare module "fastify" {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

const authMiddleware: FastifyPluginAsync = fp(async (fastify) => {
  console.log("Auth middleware initialized");
  fastify.addHook("preHandler", async (request) => {
    const url = request.raw.url || "";
    const method = request.raw.method || "GET";

    if (publicRoutes.includes(url)) {
      return; // Skip authentication for public routes
    }

    const authHeader = request.headers.authorization;
    if (!authHeader) throw new AppError("JsonWebTokenError", 401);

    const token = authHeader.split(" ")[1];
    if (!token) throw new AppError("JsonWebTokenError", 401);

    const user = await validateToken(token, fastify.prisma);
    if (!user) throw new AppError("JsonWebTokenError", 401);

    // FIXME: Get workspaceId from session

    const payload: JWTPayload = {
      userId: user.id,
      role: user.role,
      workspaceId: "",
    };

    // Check admin routes access
    if (payload.role != "ADMIN") {
      if (isAdminRoute(method, url)) {
        throw new AuthorizationError();
      }
    }

    request.user = payload;
  });
});

export default authMiddleware;

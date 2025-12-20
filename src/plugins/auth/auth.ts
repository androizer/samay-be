import fp from "fastify-plugin";
import { FastifyPluginAsync } from "fastify";
import { publicRoutes, isAdminRoute } from "./routes";
import { JWTPayload } from "./types";
import { AppError, AuthorizationError } from "../error/plugin";
import jwt from "jsonwebtoken";

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

    const decoded = jwt.decode(token) as JWTPayload;

    // Check admin routes access
    if (decoded.role != "ADMIN") {
      if (isAdminRoute(method, url)) {
        throw new AuthorizationError();
      }
    }

    request.user = decoded;
  });
});

export default authMiddleware;

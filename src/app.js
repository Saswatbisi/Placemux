import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import { Prisma } from "@prisma/client";
import Fastify from "fastify";
import { ZodError } from "zod";
import { config } from "./config.js";
import { AppError } from "./lib/errors.js";
import { prisma } from "./lib/prisma.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { companyRoutes } from "./modules/companies/company.routes.js";
import { jobRoutes } from "./modules/jobs/job.routes.js";
import { searchRoutes } from "./modules/search/search.routes.js";
import { applicationRoutes } from "./modules/applications/application.routes.js";
import { paymentRoutes } from "./modules/payments/payment.routes.js";
import { offerRoutes } from "./modules/offers/offer.routes.js";
import { interviewRoutes } from "./modules/interviews/interview.routes.js";

export async function buildApp(db = prisma) {
  const app = Fastify({
    logger: config.NODE_ENV !== "test",
    requestIdHeader: "x-request-id",
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: config.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
    credentials: true,
  });
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: "1h" },
  });

  app.decorate("authenticate", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      await reply.code(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "A valid access token is required",
          requestId: request.id,
        },
      });
      return;
    }
  });

  app.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }));

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      error: {
        code: "ROUTE_NOT_FOUND",
        message: `Route ${request.method} ${request.url} was not found`,
        requestId: request.id,
      },
    }),
  );

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: error.flatten(),
          requestId: request.id,
        },
      });
    }

    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          requestId: request.id,
        },
      });
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return reply.code(404).send({
        error: {
          code: "NOT_FOUND",
          message: "Resource not found",
          requestId: request.id,
        },
      });
    }

    request.log.error(error);
    return reply.code(500).send({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred",
        requestId: request.id,
      },
    });
  });

  await app.register(authRoutes(db), { prefix: "/api/v1/auth" });
  await app.register(companyRoutes(db), { prefix: "/api/v1/companies" });
  await app.register(jobRoutes(db), { prefix: "/api/v1" });
  await app.register(searchRoutes(db), { prefix: "/api/v1" });
  await app.register(applicationRoutes(db), { prefix: "/api/v1" });
  await app.register(paymentRoutes(db), { prefix: "/api/v1/payments" });
  await app.register(offerRoutes(db), { prefix: "/api/v1" });
  await app.register(interviewRoutes(db), { prefix: "/api/v1" });

  app.addHook("onClose", async () => {
    await db.$disconnect();
  });

  return app;
}

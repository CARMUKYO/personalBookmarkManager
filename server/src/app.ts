import express from "express";
import cookieParser from "cookie-parser";
import type { PrismaClient } from "./generated/prisma/client.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.js";

export type AppDeps = { prisma: PrismaClient };

// Builds the Express app but does NOT start listening.
// Keeping this separate from index.ts lets tests import the app directly.
// Dependencies are passed in (not imported) so tests can supply a test database.
export function createApp({ prisma }: AppDeps) {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter(prisma));

  // Order matters: these must come after every route.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

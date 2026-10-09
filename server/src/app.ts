import express from "express";
import cookieParser from "cookie-parser";
import type { Config } from "./config.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.js";
import { bookmarksRouter } from "./routes/bookmarks.js";
import { categoriesRouter } from "./routes/categories.js";

export type AppDeps = {
  prisma: PrismaClient;
  config: Pick<Config, "jwtSecret" | "isProduction">;
};

// Builds the Express app but does NOT start listening.
// Keeping this separate from index.ts lets tests import the app directly.
// Dependencies are passed in (not imported) so tests can supply a test database.
export function createApp({ prisma, config }: AppDeps) {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter(prisma, config));
  app.use("/api/bookmarks", bookmarksRouter(prisma, config));
  app.use("/api/categories", categoriesRouter(prisma, config));

  // Order matters: these must come after every route.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import type { Config } from "./config.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { authRateLimiter, type RateLimitOptions } from "./middleware/rateLimit.js";
import { authRouter } from "./routes/auth.js";
import { bookmarksRouter } from "./routes/bookmarks.js";
import { categoriesRouter } from "./routes/categories.js";

export type AppDeps = {
  prisma: PrismaClient;
  config: Pick<Config, "jwtSecret" | "isProduction">;
  // Optional so the real server uses the defaults below; tests can pass small limits.
  rateLimits?: { login?: RateLimitOptions; register?: RateLimitOptions };
};

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

// Login: 10 FAILED attempts per 15 minutes per IP. Enough for real typos, far too slow for password guessing.
// Register: 10 sign-ups (successful or not) per hour per IP, to slow down mass account creation.
const DEFAULT_LOGIN_LIMIT: RateLimitOptions = { limit: 10, windowMs: FIFTEEN_MINUTES };
const DEFAULT_REGISTER_LIMIT: RateLimitOptions = { limit: 10, windowMs: ONE_HOUR };

// Builds the Express app but does NOT start listening.
// Keeping this separate from index.ts lets tests import the app directly.
// Dependencies are passed in (not imported) so tests can supply a test database.
export function createApp({ prisma, config, rateLimits }: AppDeps) {
  const app = express();

  // Sets security-related response headers (and removes X-Powered-By). Default settings.
  app.use(helmet());
  app.use(express.json());
  app.use(cookieParser());

  // Created here, not at the top of the file, so every app instance (and every test) starts with fresh counters.
  const limiters = {
    login: authRateLimiter({ ...(rateLimits?.login ?? DEFAULT_LOGIN_LIMIT), countSuccessful: false }),
    register: authRateLimiter({ ...(rateLimits?.register ?? DEFAULT_REGISTER_LIMIT), countSuccessful: true }),
  };

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter(prisma, config, limiters));
  app.use("/api/bookmarks", bookmarksRouter(prisma, config));
  app.use("/api/categories", categoriesRouter(prisma, config));

  // Order matters: these must come after every route.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

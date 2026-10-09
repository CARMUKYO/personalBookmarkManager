import express from "express";
import cookieParser from "cookie-parser";

// Builds the Express app but does NOT start listening.
// Keeping this separate from index.ts lets tests import the app directly.
export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  return app;
}

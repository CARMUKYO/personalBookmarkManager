import { defineConfig } from "prisma/config";

// Prisma's CLI does not read .env by itself in v7, so load it here.
try {
  process.loadEnvFile();
} catch {
  // No .env file; rely on variables already set in the environment.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL ?? "file:./dev.db" },
});

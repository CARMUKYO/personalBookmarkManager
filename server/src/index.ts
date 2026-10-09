import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPrismaClient } from "./db.js";

// Load server/.env if it exists (real environment variables still take priority).
try {
  process.loadEnvFile();
} catch {
  // No .env file; fall back to variables already set in the environment.
}

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(`Configuration error: ${(err as Error).message}`);
  process.exit(1);
}

const prisma = createPrismaClient(config.databaseUrl);

createApp({ prisma }).listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});

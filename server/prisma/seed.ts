import { createPrismaClient } from "../src/db.js";
import { seed } from "../src/seed.js";

try {
  process.loadEnvFile();
} catch {
  // No .env file; rely on variables already set in the environment.
}

const prisma = createPrismaClient(process.env.DATABASE_URL ?? "file:./dev.db");

try {
  await seed(prisma);
  console.log("Seeded demo users: alice@example.com and bob@example.com (password: password123)");
} finally {
  await prisma.$disconnect();
}

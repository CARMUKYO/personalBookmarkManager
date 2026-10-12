import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createPrismaClient } from "../src/db.js";
import { testConfig } from "./helpers.js";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
// This file signs up more than the default 10 times, so raise the limit (rate limiting is tested in security.test.ts).
const app = createApp({
  prisma,
  config: testConfig,
  rateLimits: { register: { limit: 1000, windowMs: 60_000 } },
});

const register = (body: unknown) => request(app).post("/api/auth/register").send(body as object);

beforeEach(async () => {
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/auth/register", () => {
  it("creates a user and returns 201 without the password hash", async () => {
    const res = await register({ email: "new@example.com", password: "password123" });

    expect(res.status).toBe(201);
    expect(Object.keys(res.body.user).sort()).toEqual(["createdAt", "email", "id"]);
    expect(res.body.user.email).toBe("new@example.com");
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it("stores a bcrypt hash, not the plain password", async () => {
    await register({ email: "new@example.com", password: "password123" });

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: "new@example.com" } });
    expect(stored.passwordHash).not.toBe("password123");
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare("password123", stored.passwordHash)).toBe(true);
    expect(await bcrypt.compare("wrong-password", stored.passwordHash)).toBe(false);
  });

  it("stores the email trimmed and lowercased", async () => {
    const res = await register({ email: "  Mixed@Example.COM ", password: "password123" });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("mixed@example.com");
  });

  it("returns 409 EMAIL_TAKEN for a duplicate email, including different capitalization", async () => {
    await register({ email: "dup@example.com", password: "password123" });

    for (const email of ["dup@example.com", "DUP@Example.com"]) {
      const res = await register({ email, password: "password123" });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("EMAIL_TAKEN");
    }
    expect(await prisma.user.count()).toBe(1);
  });

  it.each([
    ["an invalid email", { email: "not-an-email", password: "password123" }, "email"],
    ["a too-short password", { email: "a@example.com", password: "short" }, "password"],
    ["a password over 72 bytes", { email: "a@example.com", password: "x".repeat(73) }, "password"],
    ["a missing email", { password: "password123" }, "email"],
    ["a missing password", { email: "a@example.com" }, "password"],
    ["a non-string password", { email: "a@example.com", password: 12345678 }, "password"],
  ])("returns 400 for %s and creates nothing", async (_name, body, field) => {
    const res = await register(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(field);
    expect(await prisma.user.count()).toBe(0);
  });

  it("counts password length in bytes, not characters", async () => {
    // 37 two-byte characters = 74 bytes, but only 37 characters.
    const res = await register({ email: "a@example.com", password: "é".repeat(37) });

    expect(res.status).toBe(400);
  });
});

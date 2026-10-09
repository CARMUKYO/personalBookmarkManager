import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createPrismaClient } from "../src/db.js";

const prisma = createPrismaClient(process.env.DATABASE_URL!);

describe("GET /api/health", () => {
  it("returns status ok", async () => {
    const res = await request(createApp({ prisma })).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

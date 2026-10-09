import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "../src/db.js";

const prisma = createPrismaClient(process.env.DATABASE_URL!);

beforeEach(async () => {
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("User model", () => {
  it("creates a user and reads it back", async () => {
    const created = await prisma.user.create({
      data: { email: "a@example.com", passwordHash: "hash" },
    });

    const found = await prisma.user.findUnique({ where: { id: created.id } });

    expect(found?.email).toBe("a@example.com");
    expect(found?.createdAt).toBeInstanceOf(Date);
  });

  it("rejects a duplicate email", async () => {
    await prisma.user.create({
      data: { email: "dup@example.com", passwordHash: "hash" },
    });

    await expect(
      prisma.user.create({
        data: { email: "dup@example.com", passwordHash: "other" },
      }),
    ).rejects.toMatchObject({ code: "P2002" }); // unique constraint violation
  });
});

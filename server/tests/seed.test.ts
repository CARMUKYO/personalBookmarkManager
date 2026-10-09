import bcrypt from "bcryptjs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "../src/db.js";
import { ALICE_EMAIL, BOB_EMAIL, DEMO_PASSWORD, seed } from "../src/seed.js";

const prisma = createPrismaClient(process.env.DATABASE_URL!);

beforeEach(async () => {
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function counts() {
  const alice = await prisma.user.findUniqueOrThrow({ where: { email: ALICE_EMAIL } });
  const bob = await prisma.user.findUniqueOrThrow({ where: { email: BOB_EMAIL } });
  return {
    users: await prisma.user.count(),
    aliceBookmarks: await prisma.bookmark.count({ where: { userId: alice.id } }),
    bobBookmarks: await prisma.bookmark.count({ where: { userId: bob.id } }),
    categories: await prisma.category.count(),
  };
}

describe("seed", () => {
  it("creates two users with hashed passwords", async () => {
    await seed(prisma);

    const users = await prisma.user.findMany();
    expect(users).toHaveLength(2);
    for (const user of users) {
      expect(user.passwordHash).not.toBe(DEMO_PASSWORD);
      expect(await bcrypt.compare(DEMO_PASSWORD, user.passwordHash)).toBe(true);
    }
  });

  it("gives both users bookmarks, with enough for Alice to test pagination", async () => {
    await seed(prisma);

    const c = await counts();
    expect(c.aliceBookmarks).toBeGreaterThanOrEqual(50);
    expect(c.bobBookmarks).toBeGreaterThan(0);
  });

  it("is safe to run twice", async () => {
    await seed(prisma);
    const first = await counts();

    await seed(prisma);
    expect(await counts()).toEqual(first);
  });

  it("leaves other users alone", async () => {
    await prisma.user.create({ data: { email: "keep@example.com", passwordHash: "h" } });

    await seed(prisma);

    expect(await prisma.user.findUnique({ where: { email: "keep@example.com" } })).not.toBeNull();
  });
});

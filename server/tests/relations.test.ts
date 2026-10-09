import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "../src/db.js";

const prisma = createPrismaClient(process.env.DATABASE_URL!);

async function createUser(email: string) {
  return prisma.user.create({ data: { email, passwordHash: "hash" } });
}

beforeEach(async () => {
  // Cascades remove each user's bookmarks, categories and links too.
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("bookmark <-> category relationship", () => {
  it("lets a bookmark have several categories and a category several bookmarks", async () => {
    const user = await createUser("a@example.com");
    const news = await prisma.category.create({ data: { name: "News", userId: user.id } });
    const dev = await prisma.category.create({ data: { name: "Dev", userId: user.id } });

    const first = await prisma.bookmark.create({
      data: {
        url: "https://example.com/1",
        title: "First",
        userId: user.id,
        categories: { connect: [{ id: news.id }, { id: dev.id }] },
      },
    });
    await prisma.bookmark.create({
      data: {
        url: "https://example.com/2",
        title: "Second",
        userId: user.id,
        categories: { connect: [{ id: dev.id }] },
      },
    });

    const bookmark = await prisma.bookmark.findUnique({
      where: { id: first.id },
      include: { categories: true },
    });
    const category = await prisma.category.findUnique({
      where: { id: dev.id },
      include: { bookmarks: true },
    });

    expect(bookmark?.categories.map((c) => c.name).sort()).toEqual(["Dev", "News"]);
    expect(category?.bookmarks).toHaveLength(2);
  });
});

describe("category names", () => {
  it("allows the same name for two different users", async () => {
    const a = await createUser("a@example.com");
    const b = await createUser("b@example.com");

    await prisma.category.create({ data: { name: "Recipes", userId: a.id } });
    await expect(
      prisma.category.create({ data: { name: "Recipes", userId: b.id } }),
    ).resolves.toMatchObject({ name: "Recipes", userId: b.id });
  });

  it("rejects a duplicate name for the same user", async () => {
    const a = await createUser("a@example.com");
    await prisma.category.create({ data: { name: "Recipes", userId: a.id } });

    await expect(
      prisma.category.create({ data: { name: "Recipes", userId: a.id } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("cascade rules", () => {
  it("deleting a user deletes their bookmarks and categories", async () => {
    const user = await createUser("a@example.com");
    const other = await createUser("b@example.com");
    const cat = await prisma.category.create({ data: { name: "News", userId: user.id } });
    await prisma.bookmark.create({
      data: {
        url: "https://example.com",
        title: "Mine",
        userId: user.id,
        categories: { connect: [{ id: cat.id }] },
      },
    });
    await prisma.bookmark.create({
      data: { url: "https://example.com", title: "Theirs", userId: other.id },
    });

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.bookmark.findMany({ where: { userId: user.id } })).toHaveLength(0);
    expect(await prisma.category.findMany({ where: { userId: user.id } })).toHaveLength(0);
    // The other user's data is untouched.
    expect(await prisma.bookmark.findMany({ where: { userId: other.id } })).toHaveLength(1);
  });

  it("deleting a category keeps its bookmarks but removes the link", async () => {
    const user = await createUser("a@example.com");
    const news = await prisma.category.create({ data: { name: "News", userId: user.id } });
    const dev = await prisma.category.create({ data: { name: "Dev", userId: user.id } });
    const bookmark = await prisma.bookmark.create({
      data: {
        url: "https://example.com",
        title: "Keep me",
        userId: user.id,
        categories: { connect: [{ id: news.id }, { id: dev.id }] },
      },
    });

    await prisma.category.delete({ where: { id: news.id } });

    const after = await prisma.bookmark.findUnique({
      where: { id: bookmark.id },
      include: { categories: true },
    });
    expect(after).not.toBeNull();
    expect(after?.categories.map((c) => c.name)).toEqual(["Dev"]);
  });
});

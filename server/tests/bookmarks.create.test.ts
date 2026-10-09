import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createPrismaClient } from "../src/db.js";
import { registerUser } from "../src/services/auth.js";
import { assertCategoriesOwned } from "../src/services/categories.js";
import { signToken } from "../src/services/token.js";
import { TEST_JWT_SECRET, testConfig } from "./helpers.js";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const app = createApp({ prisma, config: testConfig });

let alice: { id: number };
let bob: { id: number };
let aliceCookie: string;

const validBody = { url: "https://example.com/page", title: "Example" };

const create = (body: unknown, cookie: string | undefined = aliceCookie) => {
  const req = request(app).post("/api/bookmarks");
  return (cookie ? req.set("Cookie", cookie) : req).send(body as object);
};

beforeEach(async () => {
  await prisma.user.deleteMany();
  alice = await registerUser(prisma, "alice@example.com", "password123");
  bob = await registerUser(prisma, "bob@example.com", "password123");
  aliceCookie = `token=${await signToken(alice.id, TEST_JWT_SECRET)}`;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/bookmarks", () => {
  it("creates a bookmark and returns 201 with its fields", async () => {
    const res = await create({ ...validBody, description: "  A page  " });

    expect(res.status).toBe(201);
    expect(res.body.bookmark).toMatchObject({
      url: "https://example.com/page",
      title: "Example",
      description: "A page",
      categories: [],
    });
    expect(res.body.bookmark.id).toEqual(expect.any(Number));
    expect(res.body.bookmark).not.toHaveProperty("userId");

    const saved = await prisma.bookmark.findUnique({ where: { id: res.body.bookmark.id } });
    expect(saved?.userId).toBe(alice.id);
  });

  it("works without description or categoryIds", async () => {
    const res = await create(validBody);

    expect(res.status).toBe(201);
    expect(res.body.bookmark.description).toBeNull();
  });

  it("links the bookmark to the given categories", async () => {
    const news = await prisma.category.create({ data: { name: "News", userId: alice.id } });
    const dev = await prisma.category.create({ data: { name: "Dev", userId: alice.id } });

    const res = await create({ ...validBody, categoryIds: [news.id, dev.id, news.id] });

    expect(res.status).toBe(201);
    expect(res.body.bookmark.categories).toHaveLength(2);
    expect(res.body.bookmark.categories).toEqual(
      expect.arrayContaining([
        { id: news.id, name: "News" },
        { id: dev.id, name: "Dev" },
      ]),
    );
  });

  it("takes userId from the token and ignores a userId in the body", async () => {
    const res = await create({ ...validBody, userId: bob.id });

    expect(res.status).toBe(201);
    const saved = await prisma.bookmark.findUnique({ where: { id: res.body.bookmark.id } });
    expect(saved?.userId).toBe(alice.id);
    expect(await prisma.bookmark.count({ where: { userId: bob.id } })).toBe(0);
  });

  it("returns 401 without a cookie and creates nothing", async () => {
    const res = await create(validBody, "");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(await prisma.bookmark.count()).toBe(0);
  });

  describe("validation (400)", () => {
    it.each([
      ["missing url", { title: "T" }],
      ["not a url", { url: "not a url", title: "T" }],
      ["javascript: url", { url: "javascript:alert(1)", title: "T" }],
      ["ftp url", { url: "ftp://example.com/file", title: "T" }],
      ["missing title", { url: "https://example.com" }],
      ["blank title", { url: "https://example.com", title: "   " }],
      ["title too long", { url: "https://example.com", title: "x".repeat(201) }],
      ["description too long", { url: "https://example.com", title: "T", description: "x".repeat(2001) }],
      ["categoryIds not an array", { ...validBody, categoryIds: 5 }],
      ["categoryIds with a string", { ...validBody, categoryIds: ["a"] }],
      ["categoryIds with a decimal", { ...validBody, categoryIds: [1.5] }],
    ])("rejects %s", async (_name, body) => {
      const res = await create(body);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(await prisma.bookmark.count()).toBe(0);
    });
  });

  describe("category ownership", () => {
    it("rejects another user's category and a nonexistent one with the same response", async () => {
      const bobsCategory = await prisma.category.create({ data: { name: "Private", userId: bob.id } });

      const foreign = await create({ ...validBody, categoryIds: [bobsCategory.id] });
      const missing = await create({ ...validBody, categoryIds: [999999] });

      expect(foreign.status).toBe(400);
      expect(foreign.body).toEqual({
        error: { code: "INVALID_CATEGORY_IDS", message: "One or more categories do not exist" },
      });
      expect(missing.status).toBe(400);
      expect(missing.body).toEqual(foreign.body);
      expect(await prisma.bookmark.count()).toBe(0);
    });

    it("rejects the whole request when only some ids are foreign", async () => {
      const mine = await prisma.category.create({ data: { name: "Mine", userId: alice.id } });
      const theirs = await prisma.category.create({ data: { name: "Theirs", userId: bob.id } });

      const res = await create({ ...validBody, categoryIds: [mine.id, theirs.id] });

      expect(res.status).toBe(400);
      expect(await prisma.bookmark.count()).toBe(0);
    });
  });
});

describe("assertCategoriesOwned", () => {
  it("passes for an empty list, owned ids and duplicate ids", async () => {
    const mine = await prisma.category.create({ data: { name: "Mine", userId: alice.id } });

    await expect(assertCategoriesOwned(prisma, alice.id, [])).resolves.toBeUndefined();
    await expect(assertCategoriesOwned(prisma, alice.id, [mine.id])).resolves.toBeUndefined();
    await expect(assertCategoriesOwned(prisma, alice.id, [mine.id, mine.id])).resolves.toBeUndefined();
  });

  it("throws for a category owned by someone else", async () => {
    const theirs = await prisma.category.create({ data: { name: "Theirs", userId: bob.id } });

    await expect(assertCategoriesOwned(prisma, alice.id, [theirs.id])).rejects.toMatchObject({
      status: 400,
      code: "INVALID_CATEGORY_IDS",
    });
  });
});

import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createPrismaClient } from "../src/db.js";
import { registerUser } from "../src/services/auth.js";
import { signToken } from "../src/services/token.js";
import { TEST_JWT_SECRET, testConfig } from "./helpers.js";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const app = createApp({ prisma, config: testConfig });

const LONG_AGO = new Date("2020-01-01T00:00:00Z");

let alice: { id: number };
let bob: { id: number };
let aliceCookie: string;
let bookmarkId: number;

const patch = (id: number | string, body: unknown, cookie: string | undefined = aliceCookie) => {
  const req = request(app).patch(`/api/bookmarks/${id}`);
  return (cookie ? req.set("Cookie", cookie) : req).send(body as object);
};

beforeEach(async () => {
  await prisma.user.deleteMany();
  alice = await registerUser(prisma, "alice@example.com", "password123");
  bob = await registerUser(prisma, "bob@example.com", "password123");
  aliceCookie = `token=${await signToken(alice.id, TEST_JWT_SECRET)}`;

  const news = await prisma.category.create({ data: { name: "News", userId: alice.id } });
  const bookmark = await prisma.bookmark.create({
    data: {
      url: "https://example.com/original",
      title: "Original",
      description: "Original description",
      userId: alice.id,
      categories: { connect: [{ id: news.id }] },
    },
  });
  bookmarkId = bookmark.id;
  // Make updatedAt old so the tests can see it move forward.
  await prisma.bookmark.update({ where: { id: bookmarkId }, data: { updatedAt: LONG_AGO } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("PATCH /api/bookmarks/:id", () => {
  it("changes the title and leaves everything else alone", async () => {
    const res = await patch(bookmarkId, { title: "  New title  " });

    expect(res.status).toBe(200);
    expect(res.body.bookmark).toMatchObject({
      title: "New title",
      url: "https://example.com/original",
      description: "Original description",
    });
    expect(res.body.bookmark.categories).toHaveLength(1);
  });

  it("changes the description, and clears it with null or an empty string", async () => {
    const changed = await patch(bookmarkId, { description: "Updated" });
    expect(changed.body.bookmark.description).toBe("Updated");

    const cleared = await patch(bookmarkId, { description: null });
    expect(cleared.body.bookmark.description).toBeNull();

    await patch(bookmarkId, { description: "Back again" });
    const blank = await patch(bookmarkId, { description: "   " });
    expect(blank.body.bookmark.description).toBeNull();
  });

  it("changes the url", async () => {
    const res = await patch(bookmarkId, { url: "https://example.com/fixed" });

    expect(res.status).toBe(200);
    expect(res.body.bookmark.url).toBe("https://example.com/fixed");
  });

  it("replaces the whole set of categories", async () => {
    const dev = await prisma.category.create({ data: { name: "Dev", userId: alice.id } });
    const fun = await prisma.category.create({ data: { name: "Fun", userId: alice.id } });

    const res = await patch(bookmarkId, { categoryIds: [dev.id, fun.id] });

    expect(res.status).toBe(200);
    expect(res.body.bookmark.categories).toHaveLength(2);
    expect(res.body.bookmark.categories.map((c: { name: string }) => c.name).sort()).toEqual(["Dev", "Fun"]);
  });

  it("removes all categories with an empty list", async () => {
    const res = await patch(bookmarkId, { categoryIds: [] });

    expect(res.status).toBe(200);
    expect(res.body.bookmark.categories).toEqual([]);
  });

  it("moves updatedAt forward", async () => {
    const res = await patch(bookmarkId, { title: "Touched" });

    expect(new Date(res.body.bookmark.updatedAt).getTime()).toBeGreaterThan(LONG_AGO.getTime());
  });

  it("ignores a userId in the body", async () => {
    const res = await patch(bookmarkId, { title: "Still mine", userId: bob.id });

    expect(res.status).toBe(200);
    const saved = await prisma.bookmark.findUnique({ where: { id: bookmarkId } });
    expect(saved?.userId).toBe(alice.id);
  });

  it("returns 401 without a cookie", async () => {
    const res = await patch(bookmarkId, { title: "Nope" }, "");

    expect(res.status).toBe(401);
  });

  describe("validation (400)", () => {
    it.each([
      ["an empty body", {}],
      ["only unknown fields", { userId: 5 }],
      ["a blank title", { title: "   " }],
      ["a title that is too long", { title: "x".repeat(201) }],
      ["a javascript: url", { url: "javascript:alert(1)" }],
      ["a description that is too long", { description: "x".repeat(2001) }],
      ["categoryIds that is not an array", { categoryIds: 3 }],
      ["more than 50 categoryIds", { categoryIds: Array.from({ length: 51 }, (_, i) => i + 1) }],
    ])("rejects %s and changes nothing", async (_name, body) => {
      const res = await patch(bookmarkId, body);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      const saved = await prisma.bookmark.findUnique({ where: { id: bookmarkId } });
      expect(saved?.title).toBe("Original");
    });

    it("rejects a malformed id", async () => {
      const res = await patch("abc", { title: "x" });

      expect(res.status).toBe(400);
    });
  });

  describe("authorization", () => {
    it("returns 404 for someone else's bookmark and leaves it unchanged", async () => {
      const bobs = await prisma.bookmark.create({
        data: { url: "https://bob.example.com", title: "Bob's", description: "Private", userId: bob.id },
      });

      const res = await patch(bobs.id, { title: "Hacked", description: null });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: { code: "NOT_FOUND", message: "Bookmark not found" } });
      const saved = await prisma.bookmark.findUnique({ where: { id: bobs.id } });
      expect(saved).toMatchObject({ title: "Bob's", description: "Private", userId: bob.id });
    });

    it("returns the same 404 for a nonexistent bookmark", async () => {
      const res = await patch(999999, { title: "Ghost" });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: { code: "NOT_FOUND", message: "Bookmark not found" } });
    });

    it("rejects another user's category with 400 and changes nothing", async () => {
      const theirs = await prisma.category.create({ data: { name: "Theirs", userId: bob.id } });

      const res = await patch(bookmarkId, { title: "Changed", categoryIds: [theirs.id] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_CATEGORY_IDS");
      const saved = await prisma.bookmark.findUnique({
        where: { id: bookmarkId },
        include: { categories: true },
      });
      expect(saved?.title).toBe("Original");
      expect(saved?.categories.map((c) => c.name)).toEqual(["News"]);
    });
  });
});

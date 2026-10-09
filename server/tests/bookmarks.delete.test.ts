import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createPrismaClient } from "../src/db.js";
import { registerUser } from "../src/services/auth.js";
import { signToken } from "../src/services/token.js";
import { TEST_JWT_SECRET, testConfig } from "./helpers.js";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const app = createApp({ prisma, config: testConfig });

let alice: { id: number };
let bob: { id: number };
let aliceCookie: string;
let categoryId: number;
let bookmarkId: number;
let otherBookmarkId: number;

const del = (id: number | string, cookie: string | undefined = aliceCookie) => {
  const req = request(app).delete(`/api/bookmarks/${id}`);
  return cookie ? req.set("Cookie", cookie) : req;
};

beforeEach(async () => {
  await prisma.user.deleteMany();
  alice = await registerUser(prisma, "alice@example.com", "password123");
  bob = await registerUser(prisma, "bob@example.com", "password123");
  aliceCookie = `token=${await signToken(alice.id, TEST_JWT_SECRET)}`;

  const category = await prisma.category.create({ data: { name: "News", userId: alice.id } });
  categoryId = category.id;
  const bookmark = await prisma.bookmark.create({
    data: {
      url: "https://example.com/1",
      title: "To delete",
      userId: alice.id,
      categories: { connect: [{ id: categoryId }] },
    },
  });
  bookmarkId = bookmark.id;
  const other = await prisma.bookmark.create({
    data: { url: "https://example.com/2", title: "Keep me", userId: alice.id },
  });
  otherBookmarkId = other.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("DELETE /api/bookmarks/:id", () => {
  it("returns 204 with no body and removes the bookmark", async () => {
    const res = await del(bookmarkId);

    expect(res.status).toBe(204);
    expect(res.text).toBe("");
    expect(await prisma.bookmark.findUnique({ where: { id: bookmarkId } })).toBeNull();
  });

  it("keeps the bookmark's categories and the user's other bookmarks", async () => {
    await del(bookmarkId);

    expect(await prisma.category.findUnique({ where: { id: categoryId } })).not.toBeNull();
    expect(await prisma.bookmark.findUnique({ where: { id: otherBookmarkId } })).not.toBeNull();
  });

  it("returns 404 the second time", async () => {
    expect((await del(bookmarkId)).status).toBe(204);
    expect((await del(bookmarkId)).status).toBe(404);
  });

  it("returns the same 404 for someone else's bookmark and a nonexistent one, and leaves the other user's bookmark untouched", async () => {
    const bobs = await prisma.bookmark.create({
      data: { url: "https://bob.example.com", title: "Bob's", userId: bob.id },
    });

    const foreign = await del(bobs.id);
    const missing = await del(999999);

    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual({ error: { code: "NOT_FOUND", message: "Bookmark not found" } });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(foreign.body);
    expect(await prisma.bookmark.findUnique({ where: { id: bobs.id } })).toMatchObject({
      title: "Bob's",
      userId: bob.id,
    });
  });

  it("returns 401 without a cookie and deletes nothing", async () => {
    const res = await del(bookmarkId, "");

    expect(res.status).toBe(401);
    expect(await prisma.bookmark.findUnique({ where: { id: bookmarkId } })).not.toBeNull();
  });

  it("returns 400 for a malformed id", async () => {
    const res = await del("abc");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

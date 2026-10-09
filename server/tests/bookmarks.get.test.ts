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

const get = (id: number | string, cookie: string | undefined = aliceCookie) => {
  const req = request(app).get(`/api/bookmarks/${id}`);
  return cookie ? req.set("Cookie", cookie) : req;
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

describe("GET /api/bookmarks/:id", () => {
  it("returns your bookmark with its categories", async () => {
    const news = await prisma.category.create({ data: { name: "News", userId: alice.id } });
    const bookmark = await prisma.bookmark.create({
      data: {
        url: "https://example.com",
        title: "Mine",
        description: "Hello",
        userId: alice.id,
        categories: { connect: [{ id: news.id }] },
      },
    });

    const res = await get(bookmark.id);

    expect(res.status).toBe(200);
    expect(res.body.bookmark).toMatchObject({
      id: bookmark.id,
      url: "https://example.com",
      title: "Mine",
      description: "Hello",
      categories: [{ id: news.id, name: "News" }],
    });
    expect(res.body.bookmark).not.toHaveProperty("userId");
  });

  it("returns the same 404 for someone else's bookmark and a nonexistent one", async () => {
    const bobs = await prisma.bookmark.create({
      data: { url: "https://example.com", title: "Bob's", userId: bob.id },
    });

    const foreign = await get(bobs.id);
    const missing = await get(999999);

    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual({ error: { code: "NOT_FOUND", message: "Bookmark not found" } });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(foreign.body);
  });

  it("returns 401 without a cookie", async () => {
    const bookmark = await prisma.bookmark.create({
      data: { url: "https://example.com", title: "Mine", userId: alice.id },
    });

    const res = await get(bookmark.id, "");

    expect(res.status).toBe(401);
  });

  it.each(["abc", "0", "-1", "1.5"])("returns 400 for the id %s", async (id) => {
    const res = await get(id);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

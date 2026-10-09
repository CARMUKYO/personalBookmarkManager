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

const NOT_FOUND = { error: { code: "NOT_FOUND", message: "Category not found" } };

type Method = "get" | "post" | "patch" | "delete";

// Sends a request as Alice, or with the given cookie ("" means no cookie at all).
function send(method: Method, path: string, body?: object, cookie: string = aliceCookie) {
  const req = request(app)[method](path);
  return (cookie ? req.set("Cookie", cookie) : req).send(body);
}

const makeCategory = (userId: number, name: string) =>
  prisma.category.create({ data: { name, userId } });

beforeEach(async () => {
  await prisma.user.deleteMany();
  alice = await registerUser(prisma, "alice@example.com", "password123");
  bob = await registerUser(prisma, "bob@example.com", "password123");
  aliceCookie = `token=${await signToken(alice.id, TEST_JWT_SECRET)}`;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/categories", () => {
  it("returns only your categories, sorted by name, in the standard page shape", async () => {
    await makeCategory(alice.id, "Zebra");
    await makeCategory(alice.id, "Apple");
    await makeCategory(bob.id, "Bob's");

    const res = await send("get", "/api/categories");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [
        { id: expect.any(Number), name: "Apple" },
        { id: expect.any(Number), name: "Zebra" },
      ],
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
    });
  });

  it("returns an empty list for a user with no categories", async () => {
    await makeCategory(bob.id, "Bob's");

    const res = await send("get", "/api/categories");

    expect(res.body).toMatchObject({ data: [], total: 0, totalPages: 0 });
  });

  it("paginates, and total only counts your own categories", async () => {
    for (const name of ["A", "B", "C", "D", "E"]) await makeCategory(alice.id, name);
    await makeCategory(bob.id, "Bob's");

    const second = await send("get", "/api/categories?page=2&pageSize=2");

    expect(second.status).toBe(200);
    expect(second.body.data.map((c: { name: string }) => c.name)).toEqual(["C", "D"]);
    expect(second.body).toMatchObject({ page: 2, pageSize: 2, total: 5, totalPages: 3 });
  });

  it("returns an empty data array, not an error, for a page past the end", async () => {
    await makeCategory(alice.id, "Only");

    const res = await send("get", "/api/categories?page=99");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: [], page: 99, total: 1, totalPages: 1 });
  });

  it("returns an empty page, not a crash, for an absurdly large page number", async () => {
    const res = await send("get", "/api/categories?page=99999999999999");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it.each(["page=0", "page=abc", "page=1.5", "pageSize=0", "pageSize=101", "pageSize=abc"])(
    "returns 400 for %s",
    async (query) => {
      const res = await send("get", `/api/categories?${query}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    },
  );

  it("accepts the maximum pageSize of 100", async () => {
    const res = await send("get", "/api/categories?pageSize=100");

    expect(res.status).toBe(200);
    expect(res.body.pageSize).toBe(100);
  });
});

describe("GET /api/categories/:id", () => {
  it("returns your category", async () => {
    const news = await makeCategory(alice.id, "News");

    const res = await send("get", `/api/categories/${news.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ category: { id: news.id, name: "News" } });
  });

  it("returns the same 404 for someone else's category and a nonexistent one", async () => {
    const bobs = await makeCategory(bob.id, "Bob's");

    const foreign = await send("get", `/api/categories/${bobs.id}`);
    const missing = await send("get", "/api/categories/999999");

    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(NOT_FOUND);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(foreign.body);
  });
});

describe("POST /api/categories", () => {
  it("creates a category and returns 201", async () => {
    const res = await send("post", "/api/categories", { name: "  News  " });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ category: { id: expect.any(Number), name: "News" } });
    const saved = await prisma.category.findUnique({ where: { id: res.body.category.id } });
    expect(saved?.userId).toBe(alice.id);
  });

  it("returns 409 when you already have a category with that name", async () => {
    await makeCategory(alice.id, "News");

    const res = await send("post", "/api/categories", { name: "News" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CATEGORY_NAME_TAKEN");
    expect(await prisma.category.count({ where: { userId: alice.id } })).toBe(1);
  });

  it("returns 409 for a name that only differs by surrounding spaces", async () => {
    await makeCategory(alice.id, "News");

    const res = await send("post", "/api/categories", { name: "  News " });

    expect(res.status).toBe(409);
  });

  it("lets two different users use the same name", async () => {
    await makeCategory(bob.id, "News");

    const res = await send("post", "/api/categories", { name: "News" });

    expect(res.status).toBe(201);
  });

  it("ignores a userId in the body", async () => {
    const res = await send("post", "/api/categories", { name: "Mine", userId: bob.id });

    expect(res.status).toBe(201);
    const saved = await prisma.category.findUnique({ where: { id: res.body.category.id } });
    expect(saved?.userId).toBe(alice.id);
    expect(await prisma.category.count({ where: { userId: bob.id } })).toBe(0);
  });

  it.each([
    ["a missing name", {}],
    ["a blank name", { name: "   " }],
    ["a name that is too long", { name: "x".repeat(51) }],
    ["a name that is not a string", { name: 5 }],
  ])("rejects %s with 400", async (_label, body) => {
    const res = await send("post", "/api/categories", body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(await prisma.category.count()).toBe(0);
  });
});

describe("PATCH /api/categories/:id", () => {
  it("renames the category", async () => {
    const news = await makeCategory(alice.id, "News");

    const res = await send("patch", `/api/categories/${news.id}`, { name: " Headlines " });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ category: { id: news.id, name: "Headlines" } });
  });

  it("allows 'renaming' to the same name", async () => {
    const news = await makeCategory(alice.id, "News");

    const res = await send("patch", `/api/categories/${news.id}`, { name: "News" });

    expect(res.status).toBe(200);
  });

  it("returns 409 when renaming onto another of your categories, and changes nothing", async () => {
    const news = await makeCategory(alice.id, "News");
    await makeCategory(alice.id, "Dev");

    const res = await send("patch", `/api/categories/${news.id}`, { name: "Dev" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CATEGORY_NAME_TAKEN");
    expect((await prisma.category.findUnique({ where: { id: news.id } }))?.name).toBe("News");
  });

  it("can take a name another user already uses", async () => {
    const news = await makeCategory(alice.id, "News");
    await makeCategory(bob.id, "Dev");

    const res = await send("patch", `/api/categories/${news.id}`, { name: "Dev" });

    expect(res.status).toBe(200);
  });

  it("returns 404 for someone else's category and leaves it unchanged", async () => {
    const bobs = await makeCategory(bob.id, "Bob's");

    const res = await send("patch", `/api/categories/${bobs.id}`, { name: "Hacked" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
    expect(await prisma.category.findUnique({ where: { id: bobs.id } })).toMatchObject({
      name: "Bob's",
      userId: bob.id,
    });
  });

  it("returns the same 404 for a nonexistent category", async () => {
    const res = await send("patch", "/api/categories/999999", { name: "Ghost" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
  });

  it("ignores a userId in the body", async () => {
    const news = await makeCategory(alice.id, "News");

    await send("patch", `/api/categories/${news.id}`, { name: "Gift", userId: bob.id });

    expect((await prisma.category.findUnique({ where: { id: news.id } }))?.userId).toBe(alice.id);
  });

  it.each([
    ["a missing name", {}],
    ["a blank name", { name: "  " }],
    ["a name that is too long", { name: "x".repeat(51) }],
  ])("rejects %s with 400", async (_label, body) => {
    const news = await makeCategory(alice.id, "News");

    const res = await send("patch", `/api/categories/${news.id}`, body);

    expect(res.status).toBe(400);
    expect((await prisma.category.findUnique({ where: { id: news.id } }))?.name).toBe("News");
  });

  it("rejects a malformed id with 400", async () => {
    const res = await send("patch", "/api/categories/abc", { name: "x" });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/categories/:id", () => {
  it("returns 204 and removes the category but keeps its bookmarks", async () => {
    const news = await makeCategory(alice.id, "News");
    const bookmark = await prisma.bookmark.create({
      data: {
        url: "https://example.com",
        title: "Keep me",
        userId: alice.id,
        categories: { connect: [{ id: news.id }] },
      },
    });

    const res = await send("delete", `/api/categories/${news.id}`);

    expect(res.status).toBe(204);
    expect(res.text).toBe("");
    expect(await prisma.category.findUnique({ where: { id: news.id } })).toBeNull();
    const kept = await prisma.bookmark.findUnique({
      where: { id: bookmark.id },
      include: { categories: true },
    });
    expect(kept?.title).toBe("Keep me");
    expect(kept?.categories).toEqual([]);
  });

  it("returns 404 the second time", async () => {
    const news = await makeCategory(alice.id, "News");

    expect((await send("delete", `/api/categories/${news.id}`)).status).toBe(204);
    expect((await send("delete", `/api/categories/${news.id}`)).status).toBe(404);
  });

  it("returns 404 for someone else's category and leaves it, and its links, untouched", async () => {
    const bobs = await makeCategory(bob.id, "Bob's");
    const bobsBookmark = await prisma.bookmark.create({
      data: {
        url: "https://bob.example.com",
        title: "Bob's bookmark",
        userId: bob.id,
        categories: { connect: [{ id: bobs.id }] },
      },
    });

    const foreign = await send("delete", `/api/categories/${bobs.id}`);
    const missing = await send("delete", "/api/categories/999999");

    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(NOT_FOUND);
    expect(missing.body).toEqual(foreign.body);
    const stillThere = await prisma.bookmark.findUnique({
      where: { id: bobsBookmark.id },
      include: { categories: true },
    });
    expect(stillThere?.categories.map((c) => c.id)).toEqual([bobs.id]);
  });

  it("rejects a malformed id with 400", async () => {
    const res = await send("delete", "/api/categories/abc");

    expect(res.status).toBe(400);
  });
});

describe("authentication", () => {
  it.each([
    ["get", "/api/categories"],
    ["get", "/api/categories/1"],
    ["post", "/api/categories"],
    ["patch", "/api/categories/1"],
    ["delete", "/api/categories/1"],
  ] as [Method, string][])("%s %s returns 401 without a cookie", async (method, path) => {
    const res = await send(method, path, { name: "x" }, "");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("does nothing when unauthenticated", async () => {
    const news = await makeCategory(alice.id, "News");

    await send("patch", `/api/categories/${news.id}`, { name: "Hacked" }, "");
    await send("delete", `/api/categories/${news.id}`, undefined, "");
    await send("post", "/api/categories", { name: "New" }, "");

    expect(await prisma.category.findMany()).toEqual([news]);
  });
});

// Security regression suite: proves one user can never see or change another user's data.
// The per-route test files check behaviour; this file checks only who is allowed to do what.
import { SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createPrismaClient } from "../src/db.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { registerUser } from "../src/services/auth.js";
import { updateBookmark } from "../src/services/bookmarks.js";
import { signToken } from "../src/services/token.js";
import { TEST_JWT_SECRET, testConfig } from "./helpers.js";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const app = createApp({ prisma, config: testConfig });

let alice: { id: number };
let bob: { id: number };
let aliceBookmarkId: number;
let bobBookmarkId: number;
let aliceCategoryId: number;
let bobCategoryId: number;
let bobCookie: string;

const NOT_FOUND = { error: { code: "NOT_FOUND", message: "Bookmark not found" } };

type Method = "post" | "get" | "patch" | "delete";

// Sends a request as Bob (or with the given cookie, or with none at all when cookie is "").
function send(method: Method, path: string, body?: object, cookie: string = bobCookie) {
  const req = request(app)[method](path);
  return (cookie ? req.set("Cookie", cookie) : req).send(body);
}

async function expectAliceBookmarkUntouched() {
  const row = await prisma.bookmark.findUnique({
    where: { id: aliceBookmarkId },
    include: { categories: true },
  });
  expect(row).toMatchObject({ title: "Alice's", description: "Alice's private note", userId: alice.id });
  expect(row?.categories.map((c) => c.id)).toEqual([aliceCategoryId]);
}

beforeEach(async () => {
  await prisma.user.deleteMany();
  alice = await registerUser(prisma, "alice@example.com", "password123");
  bob = await registerUser(prisma, "bob@example.com", "password123");
  bobCookie = `token=${await signToken(bob.id, TEST_JWT_SECRET)}`;

  aliceCategoryId = (await prisma.category.create({ data: { name: "Alice cat", userId: alice.id } })).id;
  bobCategoryId = (await prisma.category.create({ data: { name: "Bob cat", userId: bob.id } })).id;

  aliceBookmarkId = (
    await prisma.bookmark.create({
      data: {
        url: "https://alice.example.com",
        title: "Alice's",
        description: "Alice's private note",
        userId: alice.id,
        categories: { connect: [{ id: aliceCategoryId }] },
      },
    })
  ).id;
  bobBookmarkId = (
    await prisma.bookmark.create({
      data: {
        url: "https://bob.example.com",
        title: "Bob's",
        userId: bob.id,
        categories: { connect: [{ id: bobCategoryId }] },
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("unauthenticated requests get 401 on every bookmark route", () => {
  const routes: [Method, (id: number) => string, object | undefined][] = [
    ["get", () => "/api/bookmarks", undefined],
    ["post", () => "/api/bookmarks", { url: "https://evil.example.com", title: "Evil" }],
    ["get", (id) => `/api/bookmarks/${id}`, undefined],
    ["patch", (id) => `/api/bookmarks/${id}`, { title: "Hacked", description: null }],
    ["delete", (id) => `/api/bookmarks/${id}`, undefined],
  ];

  const credentials: [string, () => Promise<string>][] = [
    ["no cookie", async () => ""],
    ["a garbage token", async () => "token=not-a-jwt"],
    [
      "a token signed with the wrong secret",
      async () => {
        const forged = await new SignJWT({})
          .setProtectedHeader({ alg: "HS256" })
          .setSubject(String(alice.id))
          .setIssuedAt()
          .setExpirationTime("1h")
          .sign(new TextEncoder().encode("attacker-secret-".padEnd(48, "z")));
        return `token=${forged}`;
      },
    ],
  ];

  describe.each(routes)("%s", (method, pathFor, body) => {
    it.each(credentials)("with %s", async (_label, makeCookie) => {
      const res = await send(method, pathFor(aliceBookmarkId), body, await makeCookie());

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: { code: "UNAUTHORIZED", message: "Not logged in" } });
      // The request must have been stopped before doing anything.
      await expectAliceBookmarkUntouched();
      expect(await prisma.bookmark.count()).toBe(2);
    });
  });
});

describe("Bob cannot touch Alice's bookmarks", () => {
  it("cannot read one: GET is the same 404 as for a nonexistent id", async () => {
    const foreign = await send("get", `/api/bookmarks/${aliceBookmarkId}`);
    const missing = await send("get", "/api/bookmarks/999999");

    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(NOT_FOUND);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(foreign.body);
  });

  it("cannot edit one: PATCH is the same 404 and nothing changes", async () => {
    const foreign = await send("patch", `/api/bookmarks/${aliceBookmarkId}`, {
      title: "Hacked",
      description: null,
      categoryIds: [],
    });
    const missing = await send("patch", "/api/bookmarks/999999", {
      title: "Hacked",
      description: null,
      categoryIds: [],
    });

    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(NOT_FOUND);
    expect(missing.body).toEqual(foreign.body);
    await expectAliceBookmarkUntouched();
  });

  it("cannot delete one: DELETE is the same 404 and the bookmark survives", async () => {
    const foreign = await send("delete", `/api/bookmarks/${aliceBookmarkId}`);
    const missing = await send("delete", "/api/bookmarks/999999");

    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(NOT_FOUND);
    expect(missing.body).toEqual(foreign.body);
    await expectAliceBookmarkUntouched();
  });

  it("gets 404, not a validation error, when also sending Alice's category id", async () => {
    // A 400 here would confirm the bookmark exists. The ownership check must come first.
    const res = await send("patch", `/api/bookmarks/${aliceBookmarkId}`, {
      categoryIds: [aliceCategoryId],
    });

    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
    await expectAliceBookmarkUntouched();
  });
});

describe("Bob's bookmark list never includes Alice's bookmarks", () => {
  it("shows only his own bookmarks and counts only those", async () => {
    const res = await send("get", "/api/bookmarks?pageSize=100");

    expect(res.status).toBe(200);
    expect(res.body.data.map((b: { id: number }) => b.id)).toEqual([bobBookmarkId]);
    expect(res.body.total).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain("alice");
  });

  it("stays isolated across pages", async () => {
    for (const title of ["B1", "B2", "B3"]) {
      await prisma.bookmark.create({ data: { url: "https://bob.example.com", title, userId: bob.id } });
    }
    const seen: number[] = [];

    for (const page of [1, 2, 3, 4]) {
      const res = await send("get", `/api/bookmarks?page=${page}&pageSize=1`);
      expect(res.body.total).toBe(4);
      seen.push(...res.body.data.map((b: { id: number }) => b.id));
    }

    expect(seen).toHaveLength(4);
    expect(seen).not.toContain(aliceBookmarkId);
  });

  it("is empty for a user with no bookmarks, even though others have some", async () => {
    const carol = await registerUser(prisma, "carol@example.com", "password123");
    const carolCookie = `token=${await signToken(carol.id, TEST_JWT_SECRET)}`;

    const res = await send("get", "/api/bookmarks", undefined, carolCookie);

    expect(res.body).toMatchObject({ data: [], total: 0 });
  });
});

describe("Bob cannot search into Alice's bookmarks", () => {
  // Each keyword appears in exactly one field of one of Alice's bookmarks, so every field is checked on its own.
  beforeEach(async () => {
    await prisma.bookmark.create({ data: { url: "https://alice.example.com/a", title: "zebratitle", userId: alice.id } });
    await prisma.bookmark.create({ data: { url: "https://zebraurl.example.com", title: "plain", userId: alice.id } });
    await prisma.bookmark.create({
      data: { url: "https://alice.example.com/b", title: "plain2", description: "zebradesc", userId: alice.id },
    });
  });

  it.each(["zebratitle", "zebraurl", "zebradesc", "alice"])(
    "searching for %s finds nothing and counts nothing",
    async (term) => {
      const res = await send("get", `/api/bookmarks?q=${term}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ data: [], total: 0, totalPages: 0 });
    },
  );

  it("finds only his own bookmark when both users have a matching one", async () => {
    await prisma.bookmark.create({ data: { url: "https://bob.example.com", title: "zebratitle too", userId: bob.id } });

    const res = await send("get", "/api/bookmarks?q=zebra");

    expect(res.body.total).toBe(1);
    expect(res.body.data.map((b: { title: string }) => b.title)).toEqual(["zebratitle too"]);
  });

  it("a match-everything search (q=%) still stays within his own bookmarks", async () => {
    const res = await send("get", "/api/bookmarks?q=%25");

    expect(res.body.total).toBe(1);
    expect(res.body.data.map((b: { id: number }) => b.id)).toEqual([bobBookmarkId]);
  });
});

describe("Bob cannot use Alice's categories", () => {
  const INVALID_CATEGORIES = {
    error: { code: "INVALID_CATEGORY_IDS", message: "One or more categories do not exist" },
  };

  it("POST with Alice's category id is the same 400 as for a nonexistent category", async () => {
    const body = { url: "https://example.com", title: "Sneaky" };

    const foreign = await send("post", "/api/bookmarks", { ...body, categoryIds: [aliceCategoryId] });
    const missing = await send("post", "/api/bookmarks", { ...body, categoryIds: [999999] });

    expect(foreign.status).toBe(400);
    expect(foreign.body).toEqual(INVALID_CATEGORIES);
    expect(missing.body).toEqual(foreign.body);
    expect(await prisma.bookmark.count()).toBe(2); // nothing created
  });

  it("PATCH on Bob's own bookmark with Alice's category id is the same 400 and changes nothing", async () => {
    const foreign = await send("patch", `/api/bookmarks/${bobBookmarkId}`, {
      title: "Changed",
      categoryIds: [aliceCategoryId],
    });
    const missing = await send("patch", `/api/bookmarks/${bobBookmarkId}`, {
      title: "Changed",
      categoryIds: [999999],
    });

    expect(foreign.status).toBe(400);
    expect(foreign.body).toEqual(INVALID_CATEGORIES);
    expect(missing.body).toEqual(foreign.body);

    const bobs = await prisma.bookmark.findUnique({
      where: { id: bobBookmarkId },
      include: { categories: true },
    });
    expect(bobs?.title).toBe("Bob's");
    expect(bobs?.categories.map((c) => c.id)).toEqual([bobCategoryId]);
  });

  it("Alice's category never ends up linked to Bob's bookmarks", async () => {
    await send("post", "/api/bookmarks", {
      url: "https://example.com",
      title: "Sneaky",
      categoryIds: [aliceCategoryId],
    });
    await send("patch", `/api/bookmarks/${bobBookmarkId}`, { categoryIds: [aliceCategoryId] });

    const linked = await prisma.bookmark.findMany({
      where: { categories: { some: { id: aliceCategoryId } } },
    });
    expect(linked.map((b) => b.id)).toEqual([aliceBookmarkId]);
  });
});

describe("Bob cannot choose the owner", () => {
  it("POST with Alice's userId in the body still saves the bookmark under Bob", async () => {
    const res = await send("post", "/api/bookmarks", {
      url: "https://example.com",
      title: "Mine",
      userId: alice.id,
    });

    expect(res.status).toBe(201);
    const saved = await prisma.bookmark.findUnique({ where: { id: res.body.bookmark.id } });
    expect(saved?.userId).toBe(bob.id);
  });

  it("PATCH with Alice's userId in the body cannot hand Bob's bookmark to Alice", async () => {
    const res = await send("patch", `/api/bookmarks/${bobBookmarkId}`, {
      title: "Gift",
      userId: alice.id,
    });

    expect(res.status).toBe(200);
    const saved = await prisma.bookmark.findUnique({ where: { id: bobBookmarkId } });
    expect(saved?.userId).toBe(bob.id);
  });
});

describe("updateBookmark scopes the write itself to the owner", () => {
  // updateBookmark checks ownership with a lookup AND puts userId in the update's where clause.
  // Through HTTP the lookup always stops a stranger first, so it hides a missing filter on the update.
  // This test makes the lookup "wrongly succeed" (like a race, or a future bug) to prove the update still refuses.
  it("refuses to update another user's bookmark even if the ownership lookup wrongly passed", async () => {
    const lookupWronglySucceeds = new Proxy(prisma, {
      get(target, prop) {
        if (prop !== "bookmark") return Reflect.get(target, prop);
        return new Proxy(target.bookmark, {
          get(delegate, method) {
            if (method === "findFirst") return async () => ({ id: aliceBookmarkId });
            const value = Reflect.get(delegate, method);
            return typeof value === "function" ? value.bind(delegate) : value;
          },
        });
      },
    }) as PrismaClient;

    await expect(
      updateBookmark(lookupWronglySucceeds, bob.id, aliceBookmarkId, { title: "Hacked" }),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    await expectAliceBookmarkUntouched();
  });
});

// Security regression suite: proves one user can never see or change another user's categories.
// categories.test.ts checks behaviour; this file checks only who is allowed to do what.
import { SignJWT } from "jose";
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
let aliceCategoryId: number;
let bobCategoryId: number;
let aliceBookmarkId: number;
let bobCookie: string;

const NOT_FOUND = { error: { code: "NOT_FOUND", message: "Category not found" } };

type Method = "get" | "post" | "patch" | "delete";

// Sends a request as Bob (or with the given cookie, or with none at all when cookie is "").
function send(method: Method, path: string, body?: object, cookie: string = bobCookie) {
  const req = request(app)[method](path);
  return (cookie ? req.set("Cookie", cookie) : req).send(body);
}

async function expectAliceCategoryUntouched() {
  const row = await prisma.category.findUnique({
    where: { id: aliceCategoryId },
    include: { bookmarks: true },
  });
  expect(row).toMatchObject({ name: "News", userId: alice.id });
  expect(row?.bookmarks.map((b) => b.id)).toEqual([aliceBookmarkId]);
}

beforeEach(async () => {
  await prisma.user.deleteMany();
  alice = await registerUser(prisma, "alice@example.com", "password123");
  bob = await registerUser(prisma, "bob@example.com", "password123");
  bobCookie = `token=${await signToken(bob.id, TEST_JWT_SECRET)}`;

  aliceCategoryId = (await prisma.category.create({ data: { name: "News", userId: alice.id } })).id;
  bobCategoryId = (await prisma.category.create({ data: { name: "Bob cat", userId: bob.id } })).id;
  aliceBookmarkId = (
    await prisma.bookmark.create({
      data: {
        url: "https://alice.example.com",
        title: "Alice's",
        userId: alice.id,
        categories: { connect: [{ id: aliceCategoryId }] },
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("unauthenticated requests get 401 on every category route", () => {
  const routes: [string, Method, (id: number) => string, object | undefined][] = [
    ["list", "get", () => "/api/categories", undefined],
    ["get one", "get", (id) => `/api/categories/${id}`, undefined],
    ["create", "post", () => "/api/categories", { name: "Evil" }],
    ["rename", "patch", (id) => `/api/categories/${id}`, { name: "Hacked" }],
    ["delete", "delete", (id) => `/api/categories/${id}`, undefined],
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

  describe.each(routes)("%s", (_label, method, pathFor, body) => {
    it.each(credentials)("with %s", async (_credLabel, makeCookie) => {
      const res = await send(method, pathFor(aliceCategoryId), body, await makeCookie());

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: { code: "UNAUTHORIZED", message: "Not logged in" } });
      // The request must have been stopped before doing anything.
      await expectAliceCategoryUntouched();
      expect(await prisma.category.count()).toBe(2);
    });
  });
});

describe("Bob cannot touch Alice's category", () => {
  it("cannot read it: GET is the same 404 as for a nonexistent id", async () => {
    const foreign = await send("get", `/api/categories/${aliceCategoryId}`);
    const missing = await send("get", "/api/categories/999999");

    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(NOT_FOUND);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(foreign.body);
  });

  it("cannot rename it: PATCH is the same 404 and nothing changes", async () => {
    const foreign = await send("patch", `/api/categories/${aliceCategoryId}`, { name: "Hacked" });
    const missing = await send("patch", "/api/categories/999999", { name: "Hacked" });

    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(NOT_FOUND);
    expect(missing.body).toEqual(foreign.body);
    await expectAliceCategoryUntouched();
  });

  it("cannot delete it: DELETE is the same 404, and the category and its links survive", async () => {
    const foreign = await send("delete", `/api/categories/${aliceCategoryId}`);
    const missing = await send("delete", "/api/categories/999999");

    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(NOT_FOUND);
    expect(missing.body).toEqual(foreign.body);
    await expectAliceCategoryUntouched();
  });
});

describe("names do not leak who owns what", () => {
  it("renaming Alice's category to a name Bob already uses is a 404, not a 409", async () => {
    // A 409 here would confirm that the category exists.
    const res = await send("patch", `/api/categories/${aliceCategoryId}`, { name: "Bob cat" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
    await expectAliceCategoryUntouched();
  });

  it("Bob can create a category with a name Alice uses, so her names are never visible to him", async () => {
    const res = await send("post", "/api/categories", { name: "News" });

    expect(res.status).toBe(201);
    await expectAliceCategoryUntouched();
  });

  it("Bob renaming his own category to Alice's name succeeds", async () => {
    const res = await send("patch", `/api/categories/${bobCategoryId}`, { name: "News" });

    expect(res.status).toBe(200);
    expect(res.body.category).toEqual({ id: bobCategoryId, name: "News" });
    await expectAliceCategoryUntouched();
  });

  it("Bob deleting his own 'News' leaves Alice's 'News' and its links alone", async () => {
    const bobsNews = await prisma.category.create({ data: { name: "News", userId: bob.id } });

    const res = await send("delete", `/api/categories/${bobsNews.id}`);

    expect(res.status).toBe(204);
    await expectAliceCategoryUntouched();
  });
});

describe("Bob's list never includes Alice's categories", () => {
  it("shows only his own categories and counts only those", async () => {
    const res = await send("get", "/api/categories?pageSize=100");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ id: bobCategoryId, name: "Bob cat" }]);
    expect(res.body.total).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain("News");
  });

  it("stays isolated across pages", async () => {
    for (const name of ["B1", "B2", "B3"]) await prisma.category.create({ data: { name, userId: bob.id } });
    const seen: number[] = [];

    for (const page of [1, 2, 3, 4]) {
      const res = await send("get", `/api/categories?page=${page}&pageSize=1`);
      expect(res.body.total).toBe(4);
      seen.push(...res.body.data.map((c: { id: number }) => c.id));
    }

    expect(seen).toHaveLength(4);
    expect(seen).not.toContain(aliceCategoryId);
  });

  it("is empty for a user with no categories, even though others have some", async () => {
    const carol = await registerUser(prisma, "carol@example.com", "password123");
    const carolCookie = `token=${await signToken(carol.id, TEST_JWT_SECRET)}`;

    const res = await send("get", "/api/categories", undefined, carolCookie);

    expect(res.body).toMatchObject({ data: [], total: 0 });
  });
});

describe("Bob cannot choose the owner", () => {
  it("POST with Alice's userId in the body still saves the category under Bob", async () => {
    const res = await send("post", "/api/categories", { name: "Mine", userId: alice.id });

    expect(res.status).toBe(201);
    const saved = await prisma.category.findUnique({ where: { id: res.body.category.id } });
    expect(saved?.userId).toBe(bob.id);
  });

  it("PATCH with Alice's userId in the body cannot hand Bob's category to Alice", async () => {
    const res = await send("patch", `/api/categories/${bobCategoryId}`, {
      name: "Gift",
      userId: alice.id,
    });

    expect(res.status).toBe(200);
    const saved = await prisma.category.findUnique({ where: { id: bobCategoryId } });
    expect(saved?.userId).toBe(bob.id);
  });
});

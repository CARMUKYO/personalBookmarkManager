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

const search = (query: string, cookie: string | undefined = aliceCookie) => {
  const req = request(app).get(`/api/bookmarks${query}`);
  return cookie ? req.set("Cookie", cookie) : req;
};

// q is URL-encoded so special characters reach the server exactly as typed.
const q = (term: string, extra = "") => search(`?q=${encodeURIComponent(term)}${extra}`);

type Fields = { title?: string; url?: string; description?: string | null };

const make = (userId: number, fields: Fields = {}) =>
  prisma.bookmark.create({
    data: {
      title: fields.title ?? "Untitled",
      url: fields.url ?? "https://example.com/plain",
      description: fields.description ?? null,
      userId,
    },
  });

const titles = (res: request.Response) => res.body.data.map((b: { title: string }) => b.title).sort();

beforeEach(async () => {
  await prisma.user.deleteMany();
  alice = await registerUser(prisma, "alice@example.com", "password123");
  bob = await registerUser(prisma, "bob@example.com", "password123");
  aliceCookie = `token=${await signToken(alice.id, TEST_JWT_SECRET)}`;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/bookmarks?q=", () => {
  describe("matching fields", () => {
    beforeEach(async () => {
      await make(alice.id, { title: "Needle in title" });
      await make(alice.id, { title: "Url match", url: "https://needle.example.com" });
      await make(alice.id, { title: "Description match", description: "Has a needle inside" });
      await make(alice.id, { title: "No match", description: "Nothing to see" });
    });

    it("returns bookmarks that match in the title, the url or the description", async () => {
      const res = await q("needle");

      expect(res.status).toBe(200);
      expect(titles(res)).toEqual(["Description match", "Needle in title", "Url match"]);
    });

    it.each([
      ["title", "Needle in title", "NEEDLE IN TITLE"],
      ["url", "Url match", "NEEDLE.EXAMPLE"],
      ["description", "Description match", "HAS A NEEDLE"],
    ])("matches upper-case search text against a lower-case %s", async (_field, expected, term) => {
      expect(titles(await q(term))).toEqual([expected]);
    });

    it("matches inside a word", async () => {
      expect(titles(await q("eedl"))).toEqual(["Description match", "Needle in title", "Url match"]);
    });

    it("works when the description is null", async () => {
      const res = await q("title");

      expect(res.status).toBe(200);
      expect(titles(res)).toEqual(["Needle in title"]);
    });
  });

  it("matches lower-case search text against upper-case stored text", async () => {
    await make(alice.id, { title: "HELLO WORLD" });
    await make(alice.id, { title: "x", url: "https://EXAMPLE.COM/HELLO" });
    await make(alice.id, { title: "y", description: "SAY HELLO" });

    expect(await q("hello").then((r) => r.body.total)).toBe(3);
  });

  it("treats the whole search text as one phrase", async () => {
    await make(alice.id, { title: "hello world" });
    await make(alice.id, { title: "world hello" });

    expect(titles(await q("hello world"))).toEqual(["hello world"]);
  });

  describe("empty search", () => {
    beforeEach(async () => {
      await make(alice.id, { title: "One" });
      await make(alice.id, { title: "Two" });
    });

    it.each(["", "   "])("returns everything for q=%j", async (term) => {
      const res = await q(term);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
    });

    it("returns everything when q is missing", async () => {
      expect((await search("")).body.total).toBe(2);
    });

    it("ignores spaces around the search text", async () => {
      expect(titles(await q("  one  "))).toEqual(["One"]);
    });
  });

  describe("total and pagination", () => {
    it("total and totalPages reflect the filtered count", async () => {
      for (let i = 1; i <= 25; i++) await make(alice.id, { title: `Match ${i}` });
      for (let i = 1; i <= 5; i++) await make(alice.id, { title: `Other ${i}` });

      const first = await q("match");
      const second = await q("match", "&page=2");

      expect(first.body).toMatchObject({ page: 1, pageSize: 20, total: 25, totalPages: 2 });
      expect(first.body.data).toHaveLength(20);
      expect(second.body.data).toHaveLength(5);
      expect(second.body.data.every((b: { title: string }) => b.title.startsWith("Match"))).toBe(true);
    });

    it("returns 200 with an empty list and total 0 when nothing matches", async () => {
      await make(alice.id, { title: "Something" });

      const res = await q("zzz-no-such-text");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    });

    it("keeps newest-first order within the results", async () => {
      await prisma.bookmark.create({
        data: { title: "match old", url: "https://a.example.com", userId: alice.id, createdAt: new Date("2024-01-01") },
      });
      await prisma.bookmark.create({
        data: { title: "match new", url: "https://b.example.com", userId: alice.id, createdAt: new Date("2024-06-01") },
      });

      const res = await q("match");

      expect(res.body.data.map((b: { title: string }) => b.title)).toEqual(["match new", "match old"]);
    });
  });

  describe("special characters", () => {
    it("treats quotes and SQL as plain text", async () => {
      await make(alice.id, { title: "It's fine" });

      expect(titles(await q("It's"))).toEqual(["It's fine"]);

      const attack = await q("'; DROP TABLE Bookmark; --");
      expect(attack.status).toBe(200);
      expect(attack.body.total).toBe(0);
      expect(await prisma.bookmark.count()).toBe(1); // the table is still there
    });

    // Known limitation: Prisma does not escape the LIKE wildcards % and _ on SQLite, so they keep their
    // special meaning. Results can include extra matches, but never another user's data.
    // If these tests start failing, Prisma changed behaviour: update the note in tasks.md.
    it("% acts as a wildcard for any text (known limitation)", async () => {
      await make(alice.id, { title: "100% done" });
      await make(alice.id, { title: "1000 done" });

      expect(titles(await q("100%"))).toEqual(["100% done", "1000 done"]);
      expect((await q("%")).body.total).toBe(2); // matches everything
    });

    it("_ acts as a wildcard for any single character (known limitation)", async () => {
      await make(alice.id, { title: "snake_case" });
      await make(alice.id, { title: "snakeXcase" });

      expect(titles(await q("snake_case"))).toEqual(["snakeXcase", "snake_case"]);
      expect((await q("_")).body.total).toBe(2); // matches any non-empty text
    });
  });

  describe("accented letters (known limitation)", () => {
    // SQLite's LIKE ignores case only for plain English letters. Accented letters must match exactly.
    // If this test starts failing, SQLite or Prisma changed behaviour: update the docs in tasks.md.
    it("matches accented text exactly, but not across upper and lower case", async () => {
      await make(alice.id, { title: "Un café" });

      expect((await q("café")).body.total).toBe(1);
      expect((await q("CAF")).body.total).toBe(1);
      expect((await q("CAFÉ")).body.total).toBe(0);
    });
  });

  describe("validation (400)", () => {
    it("accepts a search of exactly 100 characters", async () => {
      expect((await q("a".repeat(100))).status).toBe(200);
    });

    it("rejects a search of 101 characters", async () => {
      const res = await q("a".repeat(101));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects a repeated q", async () => {
      const res = await search("?q=a&q=b");

      expect(res.status).toBe(400);
    });
  });

  it("still requires a login", async () => {
    const res = await q("anything", "").set("Cookie", "");

    expect(res.status).toBe(401);
  });

  it("only searches the logged-in user's bookmarks", async () => {
    await make(alice.id, { title: "Shared word mine" });
    await make(bob.id, { title: "Shared word his" });

    const res = await q("shared word");

    expect(titles(res)).toEqual(["Shared word mine"]);
    expect(res.body.total).toBe(1);
  });
});

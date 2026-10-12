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

const list = (query = "", cookie: string | undefined = aliceCookie) => {
  const req = request(app).get(`/api/bookmarks${query}`);
  return cookie ? req.set("Cookie", cookie) : req;
};

const makeCategory = (userId: number, name: string) => prisma.category.create({ data: { name, userId } });

type Fields = { title?: string; description?: string | null; createdAt?: Date; categoryIds?: number[] };

const make = (userId: number, fields: Fields = {}) =>
  prisma.bookmark.create({
    data: {
      title: fields.title ?? "Untitled",
      url: "https://example.com/plain",
      description: fields.description ?? null,
      userId,
      ...(fields.createdAt && { createdAt: fields.createdAt }),
      categories: { connect: (fields.categoryIds ?? []).map((id) => ({ id })) },
    },
  });

const titles = (res: request.Response) => res.body.data.map((b: { title: string }) => b.title);

beforeEach(async () => {
  await prisma.user.deleteMany();
  alice = await registerUser(prisma, "alice@example.com", "password123");
  bob = await registerUser(prisma, "bob@example.com", "password123");
  aliceCookie = `token=${await signToken(alice.id, TEST_JWT_SECRET)}`;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/bookmarks?categoryId=", () => {
  let news: { id: number };
  let dev: { id: number };

  beforeEach(async () => {
    news = await makeCategory(alice.id, "News");
    dev = await makeCategory(alice.id, "Dev");
    await make(alice.id, { title: "Only news", categoryIds: [news.id] });
    await make(alice.id, { title: "Only dev", categoryIds: [dev.id] });
    await make(alice.id, { title: "Both", categoryIds: [news.id, dev.id] });
    await make(alice.id, { title: "None" });
  });

  it("returns only the bookmarks in that category", async () => {
    const res = await list(`?categoryId=${news.id}`);

    expect(res.status).toBe(200);
    expect(titles(res).sort()).toEqual(["Both", "Only news"]);
  });

  it("shows a bookmark with several categories under each of them, once", async () => {
    const underNews = await list(`?categoryId=${news.id}`);
    const underDev = await list(`?categoryId=${dev.id}`);

    expect(titles(underNews).filter((t: string) => t === "Both")).toHaveLength(1);
    expect(titles(underDev).sort()).toEqual(["Both", "Only dev"]);
  });

  it("still lists each bookmark's full set of categories", async () => {
    const res = await list(`?categoryId=${news.id}`);

    const both = res.body.data.find((b: { title: string }) => b.title === "Both");
    expect(both.categories.map((c: { name: string }) => c.name).sort()).toEqual(["Dev", "News"]);
  });

  it("total and totalPages reflect the filter", async () => {
    const res = await list(`?categoryId=${news.id}&pageSize=1`);

    expect(res.body).toMatchObject({ total: 2, totalPages: 2, pageSize: 1 });
    expect(res.body.data).toHaveLength(1);
  });

  it("returns an empty list for a category with no bookmarks", async () => {
    const empty = await makeCategory(alice.id, "Empty");

    const res = await list(`?categoryId=${empty.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
  });

  it("returns the same empty list for someone else's category as for a nonexistent one", async () => {
    const bobs = await makeCategory(bob.id, "Bob's");
    await make(bob.id, { title: "Bob's bookmark", categoryIds: [bobs.id] });

    const foreign = await list(`?categoryId=${bobs.id}`);
    const missing = await list("?categoryId=999999");

    expect(foreign.status).toBe(200);
    expect(foreign.body).toEqual({ data: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    expect(missing.status).toBe(200);
    expect(missing.body).toEqual(foreign.body);
  });

  it("returns the right bookmarks when another user has a category with the same name", async () => {
    const bobsNews = await makeCategory(bob.id, "News");
    await make(bob.id, { title: "Bob's news", categoryIds: [bobsNews.id] });

    const res = await list(`?categoryId=${news.id}`);

    expect(titles(res).sort()).toEqual(["Both", "Only news"]);
  });

  it.each(["abc", "0", "-1", "1.5", "", "1&categoryId=2"])("rejects categoryId=%s with 400", async (value) => {
    const res = await list(`?categoryId=${value}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /api/bookmarks?sort=", () => {
  beforeEach(async () => {
    await make(alice.id, { title: "Banana", createdAt: new Date("2024-02-01T00:00:00Z") });
    await make(alice.id, { title: "Cherry", createdAt: new Date("2024-03-01T00:00:00Z") });
    await make(alice.id, { title: "Apple", createdAt: new Date("2024-01-01T00:00:00Z") });
  });

  it("sorts newest first by default", async () => {
    expect(titles(await list())).toEqual(["Cherry", "Banana", "Apple"]);
  });

  it("sort=newest sorts newest first", async () => {
    expect(titles(await list("?sort=newest"))).toEqual(["Cherry", "Banana", "Apple"]);
  });

  it("sort=oldest sorts oldest first", async () => {
    expect(titles(await list("?sort=oldest"))).toEqual(["Apple", "Banana", "Cherry"]);
  });

  it("sort=title sorts A to Z", async () => {
    expect(titles(await list("?sort=title"))).toEqual(["Apple", "Banana", "Cherry"]);
  });

  it("sorts by title in the same order on every page", async () => {
    const first = await list("?sort=title&pageSize=2");
    const second = await list("?sort=title&pageSize=2&page=2");

    expect([...titles(first), ...titles(second)]).toEqual(["Apple", "Banana", "Cherry"]);
  });

  it.each(["bogus", "NEWEST", "", "newest&sort=oldest"])("rejects sort=%s with 400", async (value) => {
    const res = await list(`?sort=${value}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  describe("ties", () => {
    it("orders equal titles by id, and every row appears exactly once across pages", async () => {
      const ids: number[] = [];
      for (let i = 0; i < 5; i++) ids.push((await make(alice.id, { title: "Same" })).id);

      const seen: number[] = [];
      for (const page of [1, 2, 3]) {
        const res = await list(`?q=same&sort=title&pageSize=2&page=${page}`);
        seen.push(...res.body.data.map((b: { id: number }) => b.id));
      }

      expect(seen).toEqual(ids); // ascending id, no repeats, none missing
    });

    it("oldest first breaks equal timestamps by id, lowest first", async () => {
      await prisma.bookmark.deleteMany();
      const sameTime = new Date("2024-01-01T00:00:00Z");
      const first = await make(alice.id, { title: "First", createdAt: sameTime });
      const second = await make(alice.id, { title: "Second", createdAt: sameTime });

      const res = await list("?sort=oldest");

      expect(res.body.data.map((b: { id: number }) => b.id)).toEqual([first.id, second.id]);
    });
  });

  // Known limitation: SQLite compares text by character code, so every upper-case letter sorts before
  // every lower-case one. Prisma cannot change that on SQLite. A case-insensitive sort would need a
  // lower-case copy of the title (a migration) or raw SQL. If this test starts failing, update the note in tasks.md.
  it("sorts upper-case titles before lower-case ones (known limitation)", async () => {
    await prisma.bookmark.deleteMany();
    await make(alice.id, { title: "apple" });
    await make(alice.id, { title: "Zebra" });
    await make(alice.id, { title: "banana" });
    await make(alice.id, { title: "Mango" });

    expect(titles(await list("?sort=title"))).toEqual(["Mango", "Zebra", "apple", "banana"]);
  });
});

describe("search, category, sort and pagination together", () => {
  it("applies every filter at once and counts only the matches", async () => {
    const news = await makeCategory(alice.id, "News");
    const dev = await makeCategory(alice.id, "Dev");
    const bobsNews = await makeCategory(bob.id, "News");

    // 12 bookmarks that match everything (keyword "rocket", in News): "Rocket 01" ... "Rocket 12"
    for (let i = 1; i <= 12; i++) {
      await make(alice.id, { title: `Rocket ${String(i).padStart(2, "0")}`, categoryIds: [news.id] });
    }
    // Things that each fail exactly one of the conditions:
    await make(alice.id, { title: "Rocket in Dev only", categoryIds: [dev.id] }); // wrong category
    await make(alice.id, { title: "Boat 01", categoryIds: [news.id] }); // wrong keyword
    await make(alice.id, { title: "Rocket uncategorised" }); // no category
    await make(bob.id, { title: "Rocket 99", categoryIds: [bobsNews.id] }); // another user

    const first = await list(`?q=rocket&categoryId=${news.id}&sort=title&pageSize=5`);
    const third = await list(`?q=rocket&categoryId=${news.id}&sort=title&pageSize=5&page=3`);
    const newest = await list(`?q=rocket&categoryId=${news.id}&sort=newest&pageSize=5`);

    expect(first.body).toMatchObject({ page: 1, pageSize: 5, total: 12, totalPages: 3 });
    expect(titles(first)).toEqual(["Rocket 01", "Rocket 02", "Rocket 03", "Rocket 04", "Rocket 05"]);
    expect(titles(third)).toEqual(["Rocket 11", "Rocket 12"]);
    // newest = created last = highest number first, so the opposite order to the title sort
    expect(titles(newest)).toEqual(["Rocket 12", "Rocket 11", "Rocket 10", "Rocket 09", "Rocket 08"]);
  });

  it("returns an empty page, not an error, when the filters match nothing", async () => {
    const news = await makeCategory(alice.id, "News");
    await make(alice.id, { title: "Something", categoryIds: [news.id] });

    const res = await list(`?q=zzz&categoryId=${news.id}&sort=title`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: [], total: 0, totalPages: 0 });
  });
});

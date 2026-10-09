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

// Creates a bookmark; createdAt is optional so tests can control the order.
const makeBookmark = (userId: number, title: string, createdAt?: Date) =>
  prisma.bookmark.create({
    data: { url: `https://example.com/${title}`, title, userId, ...(createdAt && { createdAt }) },
  });

// Creates n bookmarks "B01", "B02", ... where a higher number is newer.
async function makeMany(userId: number, n: number) {
  const base = new Date("2024-01-01T00:00:00Z").getTime();
  for (let i = 1; i <= n; i++) {
    await makeBookmark(userId, `B${String(i).padStart(2, "0")}`, new Date(base + i * 1000));
  }
}

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

describe("GET /api/bookmarks", () => {
  it("returns the standard page shape with the defaults (page 1, pageSize 20)", async () => {
    await makeBookmark(alice.id, "Only");

    const res = await list();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [expect.objectContaining({ title: "Only" })],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it("returns an empty list for a user with no bookmarks", async () => {
    const res = await list();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
  });

  it("returns newest first", async () => {
    await makeBookmark(alice.id, "Middle", new Date("2024-02-01T00:00:00Z"));
    await makeBookmark(alice.id, "Oldest", new Date("2024-01-01T00:00:00Z"));
    await makeBookmark(alice.id, "Newest", new Date("2024-03-01T00:00:00Z"));

    const res = await list();

    expect(titles(res)).toEqual(["Newest", "Middle", "Oldest"]);
  });

  // Note: SQLite already returns ties in this order when it scans the index, so this test passes even
  // without the explicit id tie-break in listBookmarks. The tie-break makes the order guaranteed, not lucky.
  it("breaks ties between equal timestamps by id, newest id first", async () => {
    const sameTime = new Date("2024-01-01T00:00:00Z");
    const first = await makeBookmark(alice.id, "First", sameTime);
    const second = await makeBookmark(alice.id, "Second", sameTime);
    const third = await makeBookmark(alice.id, "Third", sameTime);

    const res = await list();

    expect(res.body.data.map((b: { id: number }) => b.id)).toEqual([third.id, second.id, first.id]);
  });

  it("splits 25 bookmarks into pages of 20 and 5, with no gaps or duplicates", async () => {
    await makeMany(alice.id, 25);

    const first = await list();
    const second = await list("?page=2");
    const third = await list("?page=3");

    expect(first.body).toMatchObject({ page: 1, pageSize: 20, total: 25, totalPages: 2 });
    expect(first.body.data).toHaveLength(20);
    expect(second.body.data).toHaveLength(5);
    expect(third.body.data).toEqual([]);

    const all = [...titles(first), ...titles(second)];
    expect(new Set(all).size).toBe(25);
    expect(all[0]).toBe("B25");
    expect(all[24]).toBe("B01");
  });

  it("respects a custom pageSize", async () => {
    await makeMany(alice.id, 5);

    const res = await list("?page=2&pageSize=2");

    expect(titles(res)).toEqual(["B03", "B02"]);
    expect(res.body).toMatchObject({ page: 2, pageSize: 2, total: 5, totalPages: 3 });
  });

  it("returns 200 with an empty data array for a page beyond the last", async () => {
    await makeBookmark(alice.id, "Only");

    const res = await list("?page=99");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: [], page: 99, total: 1, totalPages: 1 });
  });

  it("accepts the maximum pageSize of 100", async () => {
    const res = await list("?pageSize=100");

    expect(res.status).toBe(200);
    expect(res.body.pageSize).toBe(100);
  });

  it.each(["pageSize=101", "pageSize=0", "pageSize=abc", "page=0", "page=-1", "page=1.5", "page=abc"])(
    "rejects %s with 400",
    async (query) => {
      const res = await list(`?${query}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    },
  );

  it("only returns and counts the logged-in user's bookmarks", async () => {
    await makeMany(alice.id, 3);
    await makeMany(bob.id, 4);

    const res = await list();

    expect(res.body.total).toBe(3);
    expect(res.body.data).toHaveLength(3);
  });

  it("includes each bookmark's categories and no userId", async () => {
    const news = await prisma.category.create({ data: { name: "News", userId: alice.id } });
    await prisma.bookmark.create({
      data: {
        url: "https://example.com",
        title: "Tagged",
        userId: alice.id,
        categories: { connect: [{ id: news.id }] },
      },
    });
    await makeBookmark(alice.id, "Plain", new Date("2000-01-01T00:00:00Z"));

    const res = await list();

    const byTitle = Object.fromEntries(res.body.data.map((b: { title: string }) => [b.title, b]));
    expect(byTitle.Tagged.categories).toEqual([{ id: news.id, name: "News" }]);
    expect(byTitle.Plain.categories).toEqual([]);
    expect(byTitle.Tagged).not.toHaveProperty("userId");
  });

  it("returns 401 without a cookie", async () => {
    const res = await list("", "");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});

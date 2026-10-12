import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createPrismaClient } from "../src/db.js";
import { registerUser } from "../src/services/auth.js";
import { signToken } from "../src/services/token.js";
import { TEST_JWT_SECRET, testConfig } from "./helpers.js";

const prisma = createPrismaClient(process.env.DATABASE_URL!);

// Small limits keep the tests fast. Each test builds its own app, so its counters start at zero.
const smallLimits = {
  login: { limit: 3, windowMs: 60_000 },
  register: { limit: 3, windowMs: 60_000 },
};
const makeApp = () => createApp({ prisma, config: testConfig, rateLimits: smallLimits });

const TOO_MANY = {
  error: {
    code: "TOO_MANY_REQUESTS",
    message: "Too many attempts. Please wait a few minutes and try again.",
  },
};

const goodLogin = { email: "user@example.com", password: "password123" };
const badLogin = { email: "user@example.com", password: "wrong-password" };

beforeEach(async () => {
  await prisma.user.deleteMany();
  await registerUser(prisma, goodLogin.email, goodLogin.password);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("login rate limit", () => {
  it("answers 429 in the standard error shape after too many failed logins", async () => {
    const app = makeApp();
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post("/api/auth/login").send(badLogin);
      expect(res.status).toBe(401);
    }

    const res = await request(app).post("/api/auth/login").send(badLogin);

    expect(res.status).toBe(429);
    expect(res.body).toEqual(TOO_MANY);
    expect(res.headers["retry-after"]).toMatch(/^\d+$/);
    expect(res.headers["ratelimit"]).toBeDefined();
    expect(res.headers["ratelimit-policy"]).toBeDefined();
    expect(res.headers["x-ratelimit-limit"]).toBeUndefined();
  });

  it("also blocks the correct password once the limit is reached", async () => {
    const app = makeApp();
    for (let i = 0; i < 3; i++) await request(app).post("/api/auth/login").send(badLogin);

    const res = await request(app).post("/api/auth/login").send(goodLogin);

    expect(res.status).toBe(429);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("does not count successful logins", async () => {
    const app = makeApp();
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post("/api/auth/login").send(goodLogin);
      expect(res.status).toBe(200);
    }
    // Successful logins used none of the allowance: 3 failures are still allowed.
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post("/api/auth/login").send(badLogin);
      expect(res.status).toBe(401);
    }
  });

  it("gives every app instance its own counters", async () => {
    const first = makeApp();
    for (let i = 0; i < 4; i++) await request(first).post("/api/auth/login").send(badLogin);

    const res = await request(makeApp()).post("/api/auth/login").send(badLogin);

    expect(res.status).toBe(401);
  });

  it("uses 10 failed attempts as the default limit", async () => {
    const app = createApp({ prisma, config: testConfig });
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post("/api/auth/login").send(badLogin);
      expect(res.status).toBe(401);
    }

    const res = await request(app).post("/api/auth/login").send(badLogin);
    expect(res.status).toBe(429);
  });
});

describe("register rate limit", () => {
  it("answers 429 after too many sign-ups, counting successful ones too", async () => {
    const app = makeApp();
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ email: `new${i}@example.com`, password: "password123" });
      expect(res.status).toBe(201);
    }

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "new3@example.com", password: "password123" });

    expect(res.status).toBe(429);
    expect(res.body).toEqual(TOO_MANY);
    expect(await prisma.user.count({ where: { email: "new3@example.com" } })).toBe(0);
  });

  it("does not limit other routes", async () => {
    const app = makeApp();
    for (let i = 0; i < 5; i++) {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
    }
  });
});

describe("helmet", () => {
  it("sets security headers and hides X-Powered-By", async () => {
    const res = await request(makeApp()).get("/api/health");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["content-security-policy"]).toBeDefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

// What a malicious site can send with a plain HTML <form>: only text/plain, urlencoded or multipart bodies.
// express.json() ignores those, so validation rejects the request and nothing is written.
// (In a real browser SameSite=Lax would also leave the cookie off; here we send it anyway to test the second layer.)
describe("CSRF: non-JSON bodies are not accepted", () => {
  const formBodies = [
    ["text/plain", '{"url":"https://evil.example","title":"Evil"}'],
    ["application/x-www-form-urlencoded", "url=https%3A%2F%2Fevil.example&title=Evil"],
  ] as const;

  it.each(formBodies)("rejects a %s POST to /api/bookmarks with 400", async (contentType, body) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: goodLogin.email } });
    const cookie = `token=${await signToken(user.id, TEST_JWT_SECRET)}`;

    const res = await request(makeApp())
      .post("/api/bookmarks")
      .set("Cookie", cookie)
      .set("Content-Type", contentType)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(await prisma.bookmark.count()).toBe(0);
  });
});

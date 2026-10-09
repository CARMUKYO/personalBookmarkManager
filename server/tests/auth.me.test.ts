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

const me = (token?: string) => {
  const req = request(app).get("/api/auth/me");
  return token === undefined ? req : req.set("Cookie", `token=${token}`);
};

// Builds a token with full control over the secret, algorithm and expiry, to simulate bad tokens.
function makeToken(opts: { sub?: string; secret?: string; alg?: string; exp?: string | number }) {
  return new SignJWT({})
    .setProtectedHeader({ alg: opts.alg ?? "HS256" })
    .setSubject(opts.sub ?? "1")
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "1h")
    .sign(new TextEncoder().encode(opts.secret ?? TEST_JWT_SECRET));
}

function expectUnauthorized(res: request.Response) {
  expect(res.status).toBe(401);
  expect(res.body).toEqual({ error: { code: "UNAUTHORIZED", message: "Not logged in" } });
}

let userId: number;

beforeEach(async () => {
  await prisma.user.deleteMany();
  const user = await registerUser(prisma, "me@example.com", "password123");
  userId = user.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/auth/me", () => {
  it("returns the logged-in user without a password hash", async () => {
    const agent = request.agent(app); // an agent keeps cookies between requests, like a browser
    await agent.post("/api/auth/login").send({ email: "me@example.com", password: "password123" });

    const res = await agent.get("/api/auth/me");

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: userId, email: "me@example.com" });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it("returns 401 when there is no cookie", async () => {
    expectUnauthorized(await me());
  });

  it("returns 401 for a garbage token", async () => {
    expectUnauthorized(await me("not-a-jwt"));
  });

  it("returns 401 for an empty token", async () => {
    expectUnauthorized(await me(""));
  });

  it("returns 401 for a token signed with a different secret", async () => {
    const token = await makeToken({ sub: String(userId), secret: "other-secret-".padEnd(48, "y") });
    expectUnauthorized(await me(token));
  });

  it("returns 401 for an expired token", async () => {
    const token = await makeToken({ sub: String(userId), exp: Math.floor(Date.now() / 1000) - 60 });
    expectUnauthorized(await me(token));
  });

  it("returns 401 for a token using a different algorithm, even with the right secret", async () => {
    const token = await makeToken({ sub: String(userId), alg: "HS512" });
    expectUnauthorized(await me(token));
  });

  it("returns 401 for a token whose subject is not a user id", async () => {
    expectUnauthorized(await me(await makeToken({ sub: "abc" })));
    expectUnauthorized(await me(await makeToken({ sub: "-5" })));
  });

  it("returns 401 for a valid token whose user no longer exists", async () => {
    const token = await signToken(userId, TEST_JWT_SECRET);
    await prisma.user.delete({ where: { id: userId } });

    expectUnauthorized(await me(token));
  });

  it("accepts a valid token for an existing user", async () => {
    const token = await signToken(userId, TEST_JWT_SECRET);
    const res = await me(token);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(userId);
  });
});

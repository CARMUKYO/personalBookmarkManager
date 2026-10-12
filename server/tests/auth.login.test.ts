import bcrypt from "bcryptjs";
import { jwtVerify } from "jose";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { createPrismaClient } from "../src/db.js";
import { registerUser } from "../src/services/auth.js";
import { signToken } from "../src/services/token.js";
import { TEST_JWT_SECRET, testConfig } from "./helpers.js";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const app = createApp({ prisma, config: testConfig });

const login = (body: unknown, target = app) =>
  request(target).post("/api/auth/login").send(body as object);

function getTokenCookie(res: request.Response): string | undefined {
  const cookies = (res.headers["set-cookie"] ?? []) as unknown as string[];
  return cookies.find((c) => c.startsWith("token="));
}

let userId: number;

beforeEach(async () => {
  await prisma.user.deleteMany();
  const user = await registerUser(prisma, "login@example.com", "password123");
  userId = user.id;
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/auth/login", () => {
  it("returns 200 with the user and no password hash", async () => {
    const res = await login({ email: "login@example.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: userId, email: "login@example.com" });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it("sets an httpOnly, SameSite=Lax cookie that is not Secure outside production", async () => {
    const res = await login({ email: "login@example.com", password: "password123" });
    const cookie = getTokenCookie(res)!;

    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=604800/); // 7 days
    expect(cookie).not.toMatch(/Secure/i);
  });

  it("marks the cookie Secure in production", async () => {
    const prodApp = createApp({ prisma, config: { ...testConfig, isProduction: true } });

    const res = await login({ email: "login@example.com", password: "password123" }, prodApp);

    expect(getTokenCookie(res)).toMatch(/Secure/i);
  });

  it("issues an HS256 token for this user that expires in about 7 days", async () => {
    const res = await login({ email: "login@example.com", password: "password123" });
    const token = getTokenCookie(res)!.split(";")[0].slice("token=".length);

    const { payload, protectedHeader } = await jwtVerify(
      token,
      new TextEncoder().encode(TEST_JWT_SECRET),
      { algorithms: ["HS256"] },
    );

    expect(protectedHeader.alg).toBe("HS256");
    expect(payload.sub).toBe(String(userId));
    const secondsLeft = payload.exp! - Math.floor(Date.now() / 1000);
    expect(secondsLeft).toBeGreaterThan(7 * 24 * 60 * 60 - 60);
    expect(secondsLeft).toBeLessThanOrEqual(7 * 24 * 60 * 60);
    // Only the user id is in the token: it is signed, not encrypted.
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "sub"]);
  });

  it("never puts the token in the response body", async () => {
    const res = await login({ email: "login@example.com", password: "password123" });
    const token = getTokenCookie(res)!.split(";")[0].slice("token=".length);

    expect(JSON.stringify(res.body)).not.toContain(token);
  });

  it("matches the email case-insensitively", async () => {
    const res = await login({ email: "  LOGIN@Example.com ", password: "password123" });

    expect(res.status).toBe(200);
  });

  it("gives identical 401 responses for a wrong password and an unknown email", async () => {
    const wrongPassword = await login({ email: "login@example.com", password: "wrong-password" });
    const unknownEmail = await login({ email: "nobody@example.com", password: "password123" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(getTokenCookie(wrongPassword)).toBeUndefined();
    expect(getTokenCookie(unknownEmail)).toBeUndefined();
  });

  it("still compares a password when the email is unknown (so timing doesn't reveal accounts)", async () => {
    const compare = vi.spyOn(bcrypt, "compare");

    await login({ email: "nobody@example.com", password: "password123" });

    expect(compare).toHaveBeenCalledOnce();
  });

  it.each([
    ["a missing email", { password: "password123" }],
    ["a missing password", { email: "login@example.com" }],
    ["an empty password", { email: "login@example.com", password: "" }],
    ["a non-string password", { email: "login@example.com", password: 12345678 }],
  ])("returns 400 for %s", async (_name, body) => {
    const res = await login(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/auth/logout", () => {
  it("returns 204 and clears the cookie", async () => {
    const token = await signToken(userId, TEST_JWT_SECRET);
    const res = await request(app).post("/api/auth/logout").set("Cookie", `token=${token}`);
    const cookie = getTokenCookie(res)!;

    expect(res.status).toBe(204);
    expect(cookie).toMatch(/^token=;/);
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/i);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  // A form POST from another site arrives without our SameSite=Lax cookie. If the response still said
  // "clear the cookie", the browser would obey it and the user would be logged out.
  it("returns 204 without a Set-Cookie header when no cookie is sent", async () => {
    const res = await request(app).post("/api/auth/logout");

    expect(res.status).toBe(204);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("works without being logged in, and when called twice", async () => {
    expect((await request(app).post("/api/auth/logout")).status).toBe(204);
    expect((await request(app).post("/api/auth/logout")).status).toBe(204);
  });
});

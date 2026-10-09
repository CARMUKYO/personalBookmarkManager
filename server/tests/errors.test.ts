import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createApp } from "../src/app.js";
import { HttpError } from "../src/errors.js";
import { errorHandler, notFoundHandler } from "../src/middleware/errorHandler.js";
import { validateBody, validateQuery } from "../src/middleware/validate.js";

// A throwaway app with deliberately failing routes, so the real app stays clean.
function buildTestApp() {
  const app = express();
  app.use(express.json());

  const bodySchema = z.object({
    email: z.string().trim().toLowerCase().email(),
    age: z.number().int().min(0),
  });
  app.post("/echo", validateBody(bodySchema), (req, res) => {
    res.json(req.body);
  });

  const querySchema = z.object({ page: z.coerce.number().int().min(1).default(1) });
  app.get("/paged", validateQuery(querySchema), (_req, res) => {
    res.json(res.locals.query);
  });

  app.get("/http-error", () => {
    throw new HttpError(409, "CONFLICT", "Already exists");
  });
  app.get("/boom", () => {
    throw new Error("secret database password is hunter2");
  });
  app.get("/async-boom", async () => {
    await Promise.resolve();
    throw new HttpError(418, "TEAPOT", "Thrown from an async handler");
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("not found", () => {
  it("returns 404 in the standard shape for an unknown route", async () => {
    const res = await request(createApp()).get("/api/nope");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });
});

describe("validateBody", () => {
  it("returns 400 with field-level details for invalid input", async () => {
    const res = await request(buildTestApp()).post("/echo").send({ email: "nope", age: -1 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const paths = res.body.error.details.map((d: { path: string }) => d.path).sort();
    expect(paths).toEqual(["age", "email"]);
  });

  it("passes valid input through, applying the schema's cleanup", async () => {
    const res = await request(buildTestApp())
      .post("/echo")
      .send({ email: "  Bob@Example.COM ", age: 30 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: "bob@example.com", age: 30 });
  });

  it("returns 400 when the body is missing entirely", async () => {
    const res = await request(buildTestApp()).post("/echo");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("validateQuery", () => {
  it("returns 400 for an invalid query string", async () => {
    const res = await request(buildTestApp()).get("/paged?page=abc");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("puts the validated, typed query in res.locals.query", async () => {
    const app = buildTestApp();

    expect((await request(app).get("/paged?page=3")).body).toEqual({ page: 3 });
    expect((await request(app).get("/paged")).body).toEqual({ page: 1 });
  });
});

describe("errorHandler", () => {
  it("returns 400 INVALID_JSON for a malformed JSON body", async () => {
    const res = await request(buildTestApp())
      .post("/echo")
      .set("Content-Type", "application/json")
      .send('{"email": ');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });

  it("uses the status and code of a thrown HttpError", async () => {
    const res = await request(buildTestApp()).get("/http-error");

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: "CONFLICT", message: "Already exists" } });
  });

  it("returns a generic 500 and leaks no internals for unexpected errors", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await request(buildTestApp()).get("/boom");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
    });
    expect(JSON.stringify(res.body)).not.toContain("hunter2");
    expect(logged).toHaveBeenCalledOnce(); // the real error is still logged server-side
  });

  it("catches errors thrown inside async handlers (Express 5)", async () => {
    const res = await request(buildTestApp()).get("/async-boom");

    expect(res.status).toBe(418);
    expect(res.body.error.code).toBe("TEAPOT");
  });
});

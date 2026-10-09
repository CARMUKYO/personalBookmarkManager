import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { HttpError } from "../errors.js";

function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    throw new HttpError(400, "VALIDATION_ERROR", "Invalid request", details);
  }
  return result.data;
}

// Replaces req.body with the validated (and cleaned-up) data.
export function validateBody(schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    req.body = parse(schema, req.body);
    next();
  };
}

// Express 5 makes req.query read-only, so the validated query goes in res.locals.query.
export function validateQuery(schema: ZodType): RequestHandler {
  return (req, res, next) => {
    res.locals.query = parse(schema, req.query);
    next();
  };
}

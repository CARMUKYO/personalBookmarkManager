import type { RequestHandler } from "express";
import { z, type ZodType } from "zod";
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

// Same idea for URL parameters such as /:id. The validated params go in res.locals.params.
export function validateParams(schema: ZodType): RequestHandler {
  return (req, res, next) => {
    res.locals.params = parse(schema, req.params);
    next();
  };
}

// For routes like /:id. z.coerce turns the "5" from the URL into the number 5.
// Anything else (abc, 0, -1, 1.5) is a 400.
export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

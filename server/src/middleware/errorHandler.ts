import type { ErrorRequestHandler, RequestHandler } from "express";
import { HttpError } from "../errors.js";

type ErrorBody = {
  error: { code: string; message: string; details?: unknown };
};

// Catches any request that did not match a route.
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, "NOT_FOUND", "Route not found"));
};

// The single place where every error becomes a JSON response.
// Must be registered AFTER all routes. Express recognises it by its 4 arguments.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let status = 500;
  let body: ErrorBody = {
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  };

  if (err instanceof HttpError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message } };
    if (err.details !== undefined) body.error.details = err.details;
  } else if (err?.type === "entity.parse.failed") {
    // express.json() could not parse the request body.
    status = 400;
    body = { error: { code: "INVALID_JSON", message: "Request body is not valid JSON" } };
  } else if (err?.type === "entity.too.large") {
    // express.json() refused a body over its size limit (100 KB by default).
    status = 413;
    body = { error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" } };
  } else {
    // Unexpected: log the real error, but never send its details to the client.
    console.error(err);
  }

  res.status(status).json(body);
};

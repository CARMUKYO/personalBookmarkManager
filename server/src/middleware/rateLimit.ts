import { rateLimit } from "express-rate-limit";
import { HttpError } from "../errors.js";

export type RateLimitOptions = {
  limit: number; // how many requests are allowed...
  windowMs: number; // ...in this many milliseconds
};

// Limits how often one IP address can hit a route, to slow down password guessing and mass sign-ups.
// Counters live in memory: they reset when the server restarts and are not shared between server processes.
// countSuccessful: false = only failed requests (status 400 or above) count toward the limit.
export function authRateLimiter({
  limit,
  windowMs,
  countSuccessful,
}: RateLimitOptions & { countSuccessful: boolean }) {
  return rateLimit({
    limit,
    windowMs,
    // When true, a successful request (status below 400) is taken off the count again.
    skipSuccessfulRequests: !countSuccessful,
    // Send the standard RateLimit / RateLimit-Policy headers (and Retry-After once blocked),
    // not the older X-RateLimit-* ones.
    standardHeaders: "draft-8",
    legacyHeaders: false,
    // Hand the error to our error handler so the 429 has the usual { error: { code, message } } shape.
    handler: (_req, _res, next) => {
      next(
        new HttpError(
          429,
          "TOO_MANY_REQUESTS",
          "Too many attempts. Please wait a few minutes and try again.",
        ),
      );
    },
  });
}

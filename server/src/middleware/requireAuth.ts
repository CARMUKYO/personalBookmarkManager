import type { RequestHandler } from "express";
import type { Config } from "../config.js";
import { HttpError } from "../errors.js";
import { AUTH_COOKIE, verifyToken } from "../services/token.js";

// Put this in front of any route that needs a logged-in user.
// On success, req.userId is set from the verified token (never from the request body).
export function requireAuth(config: Pick<Config, "jwtSecret">): RequestHandler {
  return async (req, _res, next) => {
    try {
      const token = req.cookies?.[AUTH_COOKIE];
      if (typeof token !== "string" || token === "") {
        throw new Error("No token");
      }
      req.userId = await verifyToken(token, config.jwtSecret);
      next();
    } catch {
      // Missing, malformed, wrongly signed and expired tokens all look the same to the client.
      next(new HttpError(401, "UNAUTHORIZED", "Not logged in"));
    }
  };
}

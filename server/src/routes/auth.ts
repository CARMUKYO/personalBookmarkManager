import { Router, type CookieOptions } from "express";
import { z } from "zod";
import type { Config } from "../config.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { validateBody } from "../middleware/validate.js";
import { loginUser, registerUser } from "../services/auth.js";
import { signToken, TOKEN_TTL_SECONDS } from "../services/token.js";

export const AUTH_COOKIE = "token";

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  // bcrypt ignores everything past 72 bytes, so reject longer passwords instead of silently weakening them.
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .refine((p) => Buffer.byteLength(p) <= 72, "Password must be at most 72 bytes"),
});

// Login only checks the fields are present; the password rules apply when signing up.
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
});

export function authRouter(
  prisma: PrismaClient,
  config: Pick<Config, "jwtSecret" | "isProduction">,
) {
  const router = Router();

  // httpOnly: page JavaScript cannot read the cookie (limits damage from XSS).
  // sameSite lax: not sent on cross-site POSTs (first line of CSRF defence).
  // secure: only over HTTPS, so enabled in production only.
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    path: "/",
  };

  router.post("/register", validateBody(registerSchema), async (req, res) => {
    const { email, password } = req.body as z.infer<typeof registerSchema>;
    const user = await registerUser(prisma, email, password);
    res.status(201).json({ user });
  });

  router.post("/login", validateBody(loginSchema), async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const user = await loginUser(prisma, email, password);
    const token = await signToken(user.id, config.jwtSecret);

    // The token travels only in the cookie, never in the response body.
    res.cookie(AUTH_COOKIE, token, { ...cookieOptions, maxAge: TOKEN_TTL_SECONDS * 1000 });
    res.json({ user });
  });

  // Works whether or not you're logged in, so calling it twice is harmless.
  // Note: a JWT is stateless, so this removes the cookie but cannot revoke a copied token before it expires.
  router.post("/logout", (_req, res) => {
    res.clearCookie(AUTH_COOKIE, cookieOptions);
    res.status(204).end();
  });

  return router;
}

import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "../generated/prisma/client.js";
import { validateBody } from "../middleware/validate.js";
import { registerUser } from "../services/auth.js";

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  // bcrypt ignores everything past 72 bytes, so reject longer passwords instead of silently weakening them.
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .refine((p) => Buffer.byteLength(p) <= 72, "Password must be at most 72 bytes"),
});

export function authRouter(prisma: PrismaClient) {
  const router = Router();

  router.post("/register", validateBody(registerSchema), async (req, res) => {
    const { email, password } = req.body as z.infer<typeof registerSchema>;
    const user = await registerUser(prisma, email, password);
    res.status(201).json({ user });
  });

  return router;
}

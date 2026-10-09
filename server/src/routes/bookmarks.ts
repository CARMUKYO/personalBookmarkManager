import { Router } from "express";
import { z } from "zod";
import type { Config } from "../config.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validateBody } from "../middleware/validate.js";
import { createBookmark } from "../services/bookmarks.js";

// Only http(s) links: z.url() alone also accepts "javascript:..." which is dangerous once rendered as a link.
const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const { protocol } = new URL(value);
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "Must be a valid http or https URL");

// There is deliberately no userId here: zod drops unknown keys, so a userId in the body never reaches our code.
const createBookmarkSchema = z.object({
  url: httpUrl,
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(2000).optional(),
  categoryIds: z.array(z.number().int().positive()).max(50).optional(),
});

export function bookmarksRouter(
  prisma: PrismaClient,
  config: Pick<Config, "jwtSecret">,
) {
  const router = Router();

  // Every bookmark route needs a logged-in user, including ones added later.
  router.use(requireAuth(config));

  router.post("/", validateBody(createBookmarkSchema), async (req, res) => {
    const input = req.body as z.infer<typeof createBookmarkSchema>;
    const bookmark = await createBookmark(prisma, req.userId!, input);
    res.status(201).json({ bookmark });
  });

  return router;
}

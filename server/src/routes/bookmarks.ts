import { Router } from "express";
import { z } from "zod";
import type { Config } from "../config.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { idParamSchema, validateBody, validateParams } from "../middleware/validate.js";
import { createBookmark, deleteBookmark, getBookmark, updateBookmark } from "../services/bookmarks.js";

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

// Every field is optional, but at least one must be sent. Unknown keys (like userId) are dropped first,
// so a body with only unknown keys counts as empty.
// description: null (or "") clears the description.
const updateBookmarkSchema = z
  .object({
    url: httpUrl,
    title: z.string().trim().min(1, "Title is required").max(200),
    description: z
      .string()
      .trim()
      .max(2000)
      .nullable()
      .transform((value) => value || null),
    categoryIds: z.array(z.number().int().positive()).max(50),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Send at least one field to change");

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

  router.get("/:id", validateParams(idParamSchema), async (req, res) => {
    const { id } = res.locals.params as z.infer<typeof idParamSchema>;
    const bookmark = await getBookmark(prisma, req.userId!, id);
    res.json({ bookmark });
  });

  router.patch("/:id", validateParams(idParamSchema), validateBody(updateBookmarkSchema), async (req, res) => {
    const { id } = res.locals.params as z.infer<typeof idParamSchema>;
    const changes = req.body as z.infer<typeof updateBookmarkSchema>;
    const bookmark = await updateBookmark(prisma, req.userId!, id, changes);
    res.json({ bookmark });
  });

  router.delete("/:id", validateParams(idParamSchema), async (req, res) => {
    const { id } = res.locals.params as z.infer<typeof idParamSchema>;
    await deleteBookmark(prisma, req.userId!, id);
    res.status(204).end();
  });

  return router;
}

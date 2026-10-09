import { Router } from "express";
import { z } from "zod";
import type { Config } from "../config.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { idParamSchema, validateBody, validateParams, validateQuery } from "../middleware/validate.js";
import { paginationQuerySchema, type Pagination } from "../pagination.js";
import {
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  renameCategory,
} from "../services/categories.js";

// There is deliberately no userId here: zod drops unknown keys, so a userId in the body never reaches our code.
const categoryBodySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(50),
});

export function categoriesRouter(
  prisma: PrismaClient,
  config: Pick<Config, "jwtSecret">,
) {
  const router = Router();

  // Every category route needs a logged-in user, including ones added later.
  router.use(requireAuth(config));

  router.get("/", validateQuery(paginationQuerySchema), async (req, res) => {
    const pagination = res.locals.query as Pagination;
    res.json(await listCategories(prisma, req.userId!, pagination));
  });

  router.get("/:id", validateParams(idParamSchema), async (req, res) => {
    const { id } = res.locals.params as z.infer<typeof idParamSchema>;
    const category = await getCategory(prisma, req.userId!, id);
    res.json({ category });
  });

  router.post("/", validateBody(categoryBodySchema), async (req, res) => {
    const { name } = req.body as z.infer<typeof categoryBodySchema>;
    const category = await createCategory(prisma, req.userId!, name);
    res.status(201).json({ category });
  });

  router.patch("/:id", validateParams(idParamSchema), validateBody(categoryBodySchema), async (req, res) => {
    const { id } = res.locals.params as z.infer<typeof idParamSchema>;
    const { name } = req.body as z.infer<typeof categoryBodySchema>;
    const category = await renameCategory(prisma, req.userId!, id, name);
    res.json({ category });
  });

  router.delete("/:id", validateParams(idParamSchema), async (req, res) => {
    const { id } = res.locals.params as z.infer<typeof idParamSchema>;
    await deleteCategory(prisma, req.userId!, id);
    res.status(204).end();
  });

  return router;
}

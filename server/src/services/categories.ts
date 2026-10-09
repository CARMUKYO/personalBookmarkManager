import type { PrismaClient } from "../generated/prisma/client.js";
import { HttpError } from "../errors.js";

// The many-to-many link between bookmarks and categories can't check who owns a category,
// so every route that accepts categoryIds must call this first.
// Nonexistent ids and other users' ids fail identically, so nobody can probe which ids exist.
export async function assertCategoriesOwned(prisma: PrismaClient, userId: number, ids: number[]) {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return;

  const ownedCount = await prisma.category.count({
    where: { id: { in: uniqueIds }, userId },
  });

  if (ownedCount !== uniqueIds.length) {
    throw new HttpError(400, "INVALID_CATEGORY_IDS", "One or more categories do not exist");
  }
}

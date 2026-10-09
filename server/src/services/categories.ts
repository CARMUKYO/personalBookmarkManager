import type { PrismaClient } from "../generated/prisma/client.js";
import { HttpError } from "../errors.js";
import { buildPage, skipFor, type Pagination } from "../pagination.js";

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

// Only these fields leave the service. userId is left out: the caller already knows it.
const publicCategorySelect = { id: true, name: true } as const;

// "Doesn't exist" and "belongs to someone else" must look identical, so both use this error.
const notFound = () => new HttpError(404, "NOT_FOUND", "Category not found");

const nameTaken = () =>
  new HttpError(409, "CATEGORY_NAME_TAKEN", "You already have a category with this name");

const prismaCode = (err: unknown) => (err as { code?: string }).code;

export async function listCategories(prisma: PrismaClient, userId: number, pagination: Pagination) {
  const where = { userId };
  const [total, categories] = await Promise.all([
    prisma.category.count({ where }),
    prisma.category.findMany({
      where,
      select: publicCategorySelect,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: skipFor(pagination),
      take: pagination.pageSize,
    }),
  ]);
  return buildPage(categories, total, pagination);
}

export async function getCategory(prisma: PrismaClient, userId: number, id: number) {
  const category = await prisma.category.findFirst({
    where: { id, userId },
    select: publicCategorySelect,
  });
  if (!category) throw notFound();
  return category;
}

export async function createCategory(prisma: PrismaClient, userId: number, name: string) {
  try {
    return await prisma.category.create({ data: { name, userId }, select: publicCategorySelect });
  } catch (err) {
    // Rely on the database's unique (userId, name) constraint instead of "check, then insert",
    // which would let two simultaneous requests both pass the check.
    if (prismaCode(err) === "P2002") throw nameTaken();
    throw err;
  }
}

export async function renameCategory(prisma: PrismaClient, userId: number, id: number, name: string) {
  try {
    // One query, scoped to the owner: no separate lookup that could disagree with the update.
    return await prisma.category.update({
      where: { id, userId },
      data: { name },
      select: publicCategorySelect,
    });
  } catch (err) {
    if (prismaCode(err) === "P2025") throw notFound(); // no category with this id and owner
    if (prismaCode(err) === "P2002") throw nameTaken();
    throw err;
  }
}

export async function deleteCategory(prisma: PrismaClient, userId: number, id: number) {
  // Deleting a category removes its links to bookmarks, but never the bookmarks themselves.
  // deleteMany returns a count instead of throwing: 0 means "doesn't exist" or "not yours".
  const { count } = await prisma.category.deleteMany({ where: { id, userId } });
  if (count === 0) throw notFound();
}

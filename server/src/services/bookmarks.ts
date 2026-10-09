import type { PrismaClient } from "../generated/prisma/client.js";
import { HttpError } from "../errors.js";
import { buildPage, skipFor, type Pagination } from "../pagination.js";
import { assertCategoriesOwned } from "./categories.js";

// Only these fields leave the service. userId is left out on purpose: the caller already knows it.
const publicBookmarkSelect = {
  id: true,
  url: true,
  title: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  categories: { select: { id: true, name: true } },
} as const;

export type NewBookmark = {
  url: string;
  title: string;
  description?: string | undefined;
  categoryIds?: number[] | undefined;
};

export async function createBookmark(prisma: PrismaClient, userId: number, input: NewBookmark) {
  const categoryIds = [...new Set(input.categoryIds ?? [])];
  await assertCategoriesOwned(prisma, userId, categoryIds);

  return prisma.bookmark.create({
    data: {
      url: input.url,
      title: input.title,
      description: input.description,
      userId,
      categories: { connect: categoryIds.map((id) => ({ id })) },
    },
    select: publicBookmarkSelect,
  });
}

export type BookmarkChanges = {
  url?: string | undefined;
  title?: string | undefined;
  description?: string | null | undefined;
  categoryIds?: number[] | undefined;
};

// "Doesn't exist" and "belongs to someone else" must look identical, so both use this error.
const notFound = () => new HttpError(404, "NOT_FOUND", "Bookmark not found");

export async function getBookmark(prisma: PrismaClient, userId: number, id: number) {
  const bookmark = await prisma.bookmark.findFirst({
    where: { id, userId },
    select: publicBookmarkSelect,
  });
  if (!bookmark) throw notFound();
  return bookmark;
}

export async function updateBookmark(
  prisma: PrismaClient,
  userId: number,
  id: number,
  changes: BookmarkChanges,
) {
  // Check ownership first, so someone else's bookmark is a 404 whatever else is in the request.
  await getBookmark(prisma, userId, id);

  // Only touch categories if they were sent. Sending a list replaces the whole set.
  const categoryIds = changes.categoryIds && [...new Set(changes.categoryIds)];
  if (categoryIds) await assertCategoriesOwned(prisma, userId, categoryIds);

  try {
    // userId is in the where clause too, so the write itself is scoped to the owner.
    return await prisma.bookmark.update({
      where: { id, userId },
      data: {
        url: changes.url,
        title: changes.title,
        description: changes.description,
        categories: categoryIds && { set: categoryIds.map((categoryId) => ({ id: categoryId })) },
      },
      select: publicBookmarkSelect,
    });
  } catch (err) {
    // P2025: the bookmark was deleted between the check above and this update.
    if ((err as { code?: string }).code === "P2025") throw notFound();
    throw err;
  }
}

export async function deleteBookmark(prisma: PrismaClient, userId: number, id: number) {
  // One query, scoped to the owner. deleteMany returns a count instead of throwing,
  // so count 0 means "doesn't exist" or "not yours" (indistinguishable on purpose).
  const { count } = await prisma.bookmark.deleteMany({ where: { id, userId } });
  if (count === 0) throw notFound();
}

export async function listBookmarks(prisma: PrismaClient, userId: number, pagination: Pagination) {
  // The same filter for the rows and the count: total must only count this user's bookmarks.
  const where = { userId };
  const [total, bookmarks] = await Promise.all([
    prisma.bookmark.count({ where }),
    prisma.bookmark.findMany({
      where,
      select: publicBookmarkSelect,
      // id breaks ties between equal timestamps. Without it the order of those rows is undefined,
      // so they could repeat or go missing between pages.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: skipFor(pagination),
      take: pagination.pageSize,
    }),
  ]);
  return buildPage(bookmarks, total, pagination);
}

import type { PrismaClient } from "../generated/prisma/client.js";
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

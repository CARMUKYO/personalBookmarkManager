import { z } from "zod";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Query string values arrive as text ("2"), so z.coerce turns them into numbers.
// A pageSize above the maximum is rejected with a 400 instead of being silently capped.
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type Pagination = z.infer<typeof paginationQuerySchema>;

// How many rows to skip to reach the start of a page.
export const skipFor = ({ page, pageSize }: Pagination) => (page - 1) * pageSize;

// The standard shape every list endpoint returns.
export function buildPage<T>(data: T[], total: number, { page, pageSize }: Pagination) {
  return { data, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

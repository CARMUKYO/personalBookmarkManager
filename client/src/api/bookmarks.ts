import { request } from './http'
import type { Bookmark, Page } from './types'

// Search, category and sort are added in task 7.6.
export type ListBookmarksParams = {
  page?: number
  pageSize?: number
}

export function listBookmarks(params: ListBookmarksParams = {}): Promise<Page<Bookmark>> {
  // URLSearchParams builds "page=2&pageSize=20" and escapes the values for us.
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.pageSize) query.set('pageSize', String(params.pageSize))
  const queryString = query.toString()
  return request<Page<Bookmark>>(queryString ? `/bookmarks?${queryString}` : '/bookmarks')
}

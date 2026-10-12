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

// What the add/edit form sends. description: null (or '') clears it when editing.
export type BookmarkInput = {
  url: string
  title: string
  description?: string | null
  categoryIds?: number[]
}

export async function createBookmark(input: BookmarkInput): Promise<Bookmark> {
  const data = await request<{ bookmark: Bookmark }>('/bookmarks', { method: 'POST', body: input })
  return data.bookmark
}

// Only the fields that are sent are changed. Sending categoryIds replaces the whole set.
export async function updateBookmark(id: number, changes: Partial<BookmarkInput>): Promise<Bookmark> {
  const data = await request<{ bookmark: Bookmark }>(`/bookmarks/${id}`, { method: 'PATCH', body: changes })
  return data.bookmark
}

export function deleteBookmark(id: number): Promise<void> {
  return request<void>(`/bookmarks/${id}`, { method: 'DELETE' })
}

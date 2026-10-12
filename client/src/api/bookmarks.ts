import { request } from './http'
import type { Bookmark, Page } from './types'

export type BookmarkSort = 'newest' | 'oldest' | 'title'

export type ListBookmarksParams = {
  page?: number
  pageSize?: number
  q?: string // search text, matched in title, address and note
  categoryId?: number
  sort?: BookmarkSort // the server's default is 'newest'
}

export function listBookmarks(params: ListBookmarksParams = {}): Promise<Page<Bookmark>> {
  // URLSearchParams builds "page=2&q=css" and escapes the values for us (a search for "a&b" stays one value).
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.pageSize) query.set('pageSize', String(params.pageSize))
  if (params.q) query.set('q', params.q)
  if (params.categoryId) query.set('categoryId', String(params.categoryId))
  if (params.sort && params.sort !== 'newest') query.set('sort', params.sort)
  const queryString = query.toString()
  return request<Page<Bookmark>>(queryString ? `/bookmarks?${queryString}` : '/bookmarks')
}

// What the add/edit form sends. description: null (or '') means no description, and clears it when editing.
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

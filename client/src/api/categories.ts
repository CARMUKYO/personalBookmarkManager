import { request } from './http'
import type { Category, Page } from './types'

// All of the user's categories (sorted by name), for the bookmark form, the filter dropdown and "Manage categories".
// The server allows at most 100 per page. That's plenty for a personal list, so we don't page through more.
export async function listCategories(): Promise<Category[]> {
  const page = await request<Page<Category>>('/categories?pageSize=100')
  return page.data
}

// A name the user already has is rejected with 409 CATEGORY_NAME_TAKEN.
export async function createCategory(name: string): Promise<Category> {
  const data = await request<{ category: Category }>('/categories', { method: 'POST', body: { name } })
  return data.category
}

export async function renameCategory(id: number, name: string): Promise<Category> {
  const data = await request<{ category: Category }>(`/categories/${id}`, { method: 'PATCH', body: { name } })
  return data.category
}

// Removes the category from every bookmark, but keeps the bookmarks.
export function deleteCategory(id: number): Promise<void> {
  return request<void>(`/categories/${id}`, { method: 'DELETE' })
}

import { request } from './http'
import type { Category, Page } from './types'

// All of the user's categories, for the bookmark form and (in 7.6) the filter dropdown.
// The server allows at most 100 per page. That's plenty for a personal list, so we don't page through more.
export async function listCategories(): Promise<Category[]> {
  const page = await request<Page<Category>>('/categories?pageSize=100')
  return page.data
}

// The shapes the server sends back. They mirror the API described in AGENTS.md.

export type User = {
  id: number
  email: string
  createdAt: string
}

export type Category = {
  id: number
  name: string
}

export type Bookmark = {
  id: number
  url: string
  title: string
  description: string | null
  createdAt: string
  updatedAt: string
  categories: Category[]
}

// Every list endpoint returns this wrapper.
export type Page<T> = {
  data: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

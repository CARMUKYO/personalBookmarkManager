import type { BookmarkSort } from '../api/bookmarks'

// The list's search, category, sort and page, all kept in the address bar:
//   /?q=css&categoryId=3&sort=title&page=2
// So reload, Back, and a copied link all show the same list. Defaults are left out to keep the address short.

export type BookmarkFilters = {
  page: number
  q: string // '' means no search
  categoryId?: number
  sort: BookmarkSort
}

export type FilterChanges = Partial<Omit<BookmarkFilters, 'page'>>

const SORTS: BookmarkSort[] = ['newest', 'oldest', 'title']

function positiveInteger(value: string | null): number | undefined {
  const number = Number(value)
  return value && Number.isInteger(number) && number >= 1 ? number : undefined
}

// Reads the filters from the address. Anything missing or invalid falls back to the default,
// so a hand-edited address like ?page=abc&sort=random still shows a list instead of an error.
export function readFilters(params: URLSearchParams): BookmarkFilters {
  const sort = params.get('sort') as BookmarkSort | null
  return {
    page: positiveInteger(params.get('page')) ?? 1,
    q: (params.get('q') ?? '').trim(),
    categoryId: positiveInteger(params.get('categoryId')),
    sort: sort && SORTS.includes(sort) ? sort : 'newest',
  }
}

// Applies `changes` to the current address. Any change of search, category or sort goes back to page 1,
// because page 3 of the old list means nothing in the new one.
export function withFilters(current: URLSearchParams, changes: FilterChanges): URLSearchParams {
  const next = new URLSearchParams(current)
  next.delete('page')
  if ('q' in changes) {
    const q = changes.q?.trim()
    if (q) next.set('q', q)
    else next.delete('q')
  }
  if ('categoryId' in changes) {
    if (changes.categoryId) next.set('categoryId', String(changes.categoryId))
    else next.delete('categoryId')
  }
  if ('sort' in changes) {
    if (changes.sort && changes.sort !== 'newest') next.set('sort', changes.sort)
    else next.delete('sort')
  }
  return next
}

// Moves to another page and keeps every filter.
export function withPage(current: URLSearchParams, page: number): URLSearchParams {
  const next = new URLSearchParams(current)
  if (page === 1) next.delete('page')
  else next.set('page', String(page))
  return next
}

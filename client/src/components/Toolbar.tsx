import { useEffect, useEffectEvent, useState, type FormEvent } from 'react'
import type { BookmarkSort } from '../api/bookmarks'
import type { Category } from '../api/types'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import type { FilterChanges } from '../pages/bookmarkFilters'

type ToolbarProps = {
  q: string
  categoryId?: number
  sort: BookmarkSort
  categories: Category[]
  // replace: change the current history entry instead of adding one (so Back doesn't step through every search).
  onChange: (changes: FilterChanges, options?: { replace?: boolean }) => void
}

const SEARCH_DELAY_MS = 300

// Search box, category dropdown and sort dropdown above the list.
export function Toolbar({ q, categoryId, sort, categories, onChange }: ToolbarProps) {
  // What's in the search box right now. It's sent to the address (and so to the server) once typing pauses.
  const [text, setText] = useState(q)

  // If the search in the address changes from outside (the Back button, "Clear search"), show it in the box.
  // This is React's pattern for "adjust state when a prop changes": compare with the last value during render.
  const [lastQ, setLastQ] = useState(q)
  if (q !== lastQ) {
    setLastQ(q)
    // Unless the box already says the same (it may have a trailing space the user is about to type after).
    if (text.trim() !== q) setText(q)
  }

  function applySearch(value: string) {
    if (value.trim() === q) return
    // The first search adds a history entry, so Back returns to the full list.
    // Refining an existing search replaces it, so Back doesn't replay every pause in the typing.
    onChange({ q: value }, { replace: q !== '' })
  }

  const debouncedText = useDebouncedValue(text, SEARCH_DELAY_MS)
  const onDebouncedText = useEffectEvent((value: string) => applySearch(value))
  useEffect(() => onDebouncedText(debouncedText), [debouncedText])

  // Enter searches right away instead of waiting for the pause.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    applySearch(text)
  }

  // A category from an old link that no longer exists (or was never yours): show that instead of "All categories".
  const unknownCategory =
    categoryId !== undefined && categories.length > 0 && !categories.some((category) => category.id === categoryId)

  return (
    <form className="toolbar" role="search" onSubmit={handleSubmit}>
      <div className="search">
        <label className="vh" htmlFor="search-q">
          Search bookmarks
        </label>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="M13 13l4 4" />
        </svg>
        <input
          className="input"
          id="search-q"
          type="search"
          name="q"
          placeholder="Search title, address or note…"
          autoComplete="off"
          maxLength={100}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div>
        <label className="vh" htmlFor="filter-category">
          Category
        </label>
        <select
          className="select"
          id="filter-category"
          value={categoryId ?? ''}
          onChange={(e) => onChange({ categoryId: e.target.value ? Number(e.target.value) : undefined })}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
          {unknownCategory && <option value={categoryId}>Unknown category</option>}
        </select>
      </div>
      <div>
        <label className="vh" htmlFor="filter-sort">
          Sort by
        </label>
        <select
          className="select"
          id="filter-sort"
          value={sort}
          onChange={(e) => onChange({ sort: e.target.value as BookmarkSort })}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="title">Title A to Z</option>
        </select>
      </div>
    </form>
  )
}

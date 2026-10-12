import { useEffect, useRef, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { listBookmarks } from '../api/bookmarks'
import { listCategories } from '../api/categories'
import type { Bookmark, Category, Page } from '../api/types'
import { BookmarkDialog } from '../components/BookmarkDialog'
import { BookmarkRow } from '../components/BookmarkRow'
import { ConfirmDeleteDialog } from '../components/ConfirmDeleteDialog'
import { Pager } from '../components/Pager'
import { Toolbar } from '../components/Toolbar'
import { readFilters, withFilters, withPage, type FilterChanges } from './bookmarkFilters'

// Which dialog is open, if any. Only one can be open at a time.
type OpenDialog = { kind: 'add' } | { kind: 'edit'; bookmark: Bookmark } | { kind: 'delete'; bookmark: Bookmark } | null

export function BookmarksPage() {
  // Page, search, category and sort live in the address bar, so Back, reload and shared links all keep them.
  const [searchParams, setSearchParams] = useSearchParams()
  const { page, q, categoryId, sort } = readFilters(searchParams)
  const filtering = q !== '' || categoryId !== undefined // sort doesn't hide anything, so it doesn't count

  const [categories, setCategories] = useState<Category[]>([]) // for the filter dropdown and messages

  // Bumped to load the list again: by "Try again", and after every add, edit and delete.
  const [reloadCount, setReloadCount] = useState(0)

  // Each answer remembers which request it belongs to. Whether we're loading, or whether an error is current,
  // is then worked out below instead of being stored, so it can never get out of step.
  const requestKey = JSON.stringify([page, q, categoryId, sort, reloadCount])
  const [loaded, setLoaded] = useState<{ key: string; result: Page<Bookmark> } | null>(null) // last page that loaded
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null)

  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [announcement, setAnnouncement] = useState('') // read out by screen readers, e.g. "Bookmark deleted"

  const headingRef = useRef<HTMLHeadingElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  // After a delete: the position of the deleted row, so focus can move to the row that takes its place.
  const focusRowAfterLoad = useRef<number | null>(null)

  useEffect(() => {
    let ignore = false // set on cleanup, so the answer for an old page can't overwrite a newer one
    listBookmarks({ page, q: q || undefined, categoryId, sort })
      .then((result) => {
        if (!ignore) setLoaded({ key: requestKey, result })
      })
      .catch((err: Error) => {
        if (!ignore) setFailed({ key: requestKey, message: err.message })
      })
    return () => {
      ignore = true
    }
  }, [page, q, categoryId, sort, requestKey])

  useEffect(() => {
    let ignore = false
    listCategories()
      .then((list) => {
        if (!ignore) setCategories(list)
      })
      // Without categories the dropdown only offers "All categories"; the list itself still works.
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [])

  const result = loaded?.result ?? null
  const error = failed?.key === requestKey ? failed.message : null
  const loading = loaded?.key !== requestKey && !error
  const pastTheEnd = !loading && result !== null && result.data.length === 0 && result.total > 0

  // The deleted row's button is gone, so keyboard focus would fall back to the top of the page.
  // Once the list has reloaded, put focus on the row that took its place (or the last row, or the heading).
  useEffect(() => {
    if (focusRowAfterLoad.current === null || loading || pastTheEnd) return
    const links = listRef.current?.querySelectorAll<HTMLAnchorElement>('.row-title a') ?? []
    if (links.length > 0) links[Math.min(focusRowAfterLoad.current, links.length - 1)].focus()
    else headingRef.current?.focus()
    focusRowAfterLoad.current = null
  }, [loading, pastTheEnd])

  function goToPage(nextPage: number) {
    setSearchParams((current) => withPage(current, nextPage))
  }

  function changeFilters(changes: FilterChanges, options?: { replace?: boolean }) {
    setSearchParams((current) => withFilters(current, changes), { replace: options?.replace })
  }

  // A chip's link: the current list, filtered by that category instead.
  function categoryHref(id: number) {
    return `?${withFilters(searchParams, { categoryId: id })}`
  }

  const categoryName = categories.find((category) => category.id === categoryId)?.name ?? 'this category'

  function handleSaved() {
    const added = dialog?.kind === 'add'
    setDialog(null)
    setAnnouncement(added ? 'Bookmark added' : 'Changes saved')
    // The list is newest first, so a new bookmark is at the top of page 1: go there to show it.
    if (added) goToPage(1)
    setReloadCount((n) => n + 1)
  }

  function handleDeleted(bookmark: Bookmark) {
    focusRowAfterLoad.current = Math.max(0, result?.data.findIndex((b) => b.id === bookmark.id) ?? 0)
    setDialog(null)
    setAnnouncement('Bookmark deleted')
    setReloadCount((n) => n + 1)
  }

  // A page past the end (an old link, or the last bookmark on the last page was deleted): go to the real last page.
  if (pastTheEnd) {
    return <Navigate to={`?${withPage(searchParams, result.totalPages)}`} replace />
  }

  let content
  if (error) {
    content = (
      <div className="panel">
        <div className="empty" role="alert">
          <h3>Couldn't load your bookmarks</h3>
          <p>{error}</p>
          <button className="btn btn-secondary" type="button" onClick={() => setReloadCount((n) => n + 1)}>
            Try again
          </button>
        </div>
      </div>
    )
  } else if (!result) {
    // Only on the very first load. When changing pages, the old rows stay visible (dimmed) until the new ones arrive.
    content = (
      <div className="panel">
        <p className="panel-message" role="status">
          Loading bookmarks…
        </p>
      </div>
    )
  } else if (result.total === 0 && filtering) {
    // Nothing matches the search or category. Say what was searched, and offer a way back.
    content = (
      <div className="panel">
        <div className="empty">
          {q ? (
            <>
              <h3>No bookmarks match “{q}”</h3>
              <p>
                {categoryId ? `Only “${categoryName}” was searched. ` : ''}Check the spelling, or try a shorter word.
              </p>
              <button className="btn btn-secondary" type="button" onClick={() => changeFilters({ q: '' })}>
                Clear search
              </button>
            </>
          ) : (
            <>
              <h3>No bookmarks in “{categoryName}”</h3>
              <p>Add this category to a bookmark when you add or edit it.</p>
              <button className="btn btn-secondary" type="button" onClick={() => changeFilters({ categoryId: undefined })}>
                Show all bookmarks
              </button>
            </>
          )}
        </div>
      </div>
    )
  } else if (result.total === 0) {
    content = (
      <div className="panel">
        <div className="empty">
          <div className="tile-stack" aria-hidden="true">
            <span className="tile" data-hue="1">G</span>
            <span className="tile" data-hue="3">R</span>
            <span className="tile" data-hue="6">M</span>
          </div>
          <h3>No bookmarks yet</h3>
          <p>Save a link here and you can find it later by its title, address or note.</p>
          <button className="btn btn-primary" type="button" onClick={() => setDialog({ kind: 'add' })}>
            Add your first bookmark
          </button>
        </div>
      </div>
    )
  } else {
    content = (
      <>
        <div className="panel">
          {q && (
            <div className="result-note">
              <p>
                {result.total} {result.total === 1 ? 'bookmark matches' : 'bookmarks match'} “{q}”
              </p>
              <button className="btn btn-quiet" type="button" onClick={() => changeFilters({ q: '' })}>
                Clear search
              </button>
            </div>
          )}
          <ul className="bookmarks" aria-busy={loading} ref={listRef}>
            {result.data.map((bookmark) => (
              <BookmarkRow
                key={bookmark.id}
                bookmark={bookmark}
                onEdit={(b) => setDialog({ kind: 'edit', bookmark: b })}
                onDelete={(b) => setDialog({ kind: 'delete', bookmark: b })}
                categoryHref={categoryHref}
              />
            ))}
          </ul>
        </div>
        <Pager
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
          totalPages={result.totalPages}
          shownCount={result.data.length}
          disabled={loading}
          onPageChange={goToPage}
        />
      </>
    )
  }

  return (
    <>
      <div className="page-head">
        {/* tabIndex -1: not in the Tab order, but focus can be moved here from code (after deleting the last row). */}
        <h1 ref={headingRef} tabIndex={-1}>
          Your bookmarks
        </h1>
        <button className="btn btn-primary" type="button" onClick={() => setDialog({ kind: 'add' })}>
          Add bookmark
        </button>
      </div>
      {/* Hidden for a brand-new user: there's nothing to search yet. Shown while filters are on, so they can be undone. */}
      {(filtering || !result || result.total > 0) && (
        <Toolbar q={q} categoryId={categoryId} sort={sort} categories={categories} onChange={changeFilters} />
      )}
      <section className="results" aria-labelledby="results-heading">
        <h2 id="results-heading" className="vh">
          {filtering ? 'Search results' : 'Bookmark list'}
        </h2>
        {content}
      </section>
      <p className="vh" role="status">
        {announcement}
      </p>

      {dialog?.kind === 'add' && <BookmarkDialog onClose={() => setDialog(null)} onSaved={handleSaved} />}
      {dialog?.kind === 'edit' && (
        // key: a different bookmark gets a fresh form instead of reusing the last one's typed values.
        <BookmarkDialog
          key={dialog.bookmark.id}
          bookmark={dialog.bookmark}
          onClose={() => setDialog(null)}
          onSaved={handleSaved}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDeleteDialog
          bookmark={dialog.bookmark}
          onClose={() => setDialog(null)}
          onDeleted={() => handleDeleted(dialog.bookmark)}
        />
      )}
    </>
  )
}

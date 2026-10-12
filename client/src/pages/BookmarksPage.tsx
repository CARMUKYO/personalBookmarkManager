import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { listBookmarks } from '../api/bookmarks'
import type { Bookmark, Page } from '../api/types'
import { BookmarkRow } from '../components/BookmarkRow'
import { Pager } from '../components/Pager'

// ?page=2 -> 2. Anything missing or invalid (?page=abc, ?page=0) means the first page.
function pageFromUrl(value: string | null): number {
  const page = Number(value)
  return Number.isInteger(page) && page >= 1 ? page : 1
}

export function BookmarksPage() {
  // The page number lives in the address bar, so Back, reload and shared links all keep it.
  const [searchParams, setSearchParams] = useSearchParams()
  const page = pageFromUrl(searchParams.get('page'))

  const [reloadCount, setReloadCount] = useState(0) // "Try again" bumps this to run the effect again

  // Each answer remembers which request it belongs to. Whether we're loading, or whether an error is current,
  // is then worked out below instead of being stored, so it can never get out of step.
  const requestKey = `${page}/${reloadCount}`
  const [loaded, setLoaded] = useState<{ key: string; result: Page<Bookmark> } | null>(null) // last page that loaded
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null)

  useEffect(() => {
    let ignore = false // set on cleanup, so the answer for an old page can't overwrite a newer one
    listBookmarks({ page })
      .then((result) => {
        if (!ignore) setLoaded({ key: requestKey, result })
      })
      .catch((err: Error) => {
        if (!ignore) setFailed({ key: requestKey, message: err.message })
      })
    return () => {
      ignore = true
    }
  }, [page, requestKey])

  const result = loaded?.result ?? null
  const error = failed?.key === requestKey ? failed.message : null
  const loading = loaded?.key !== requestKey && !error

  function goToPage(nextPage: number) {
    // Copy the current query so other values (search and filters, from task 7.6) are kept.
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (nextPage === 1) next.delete('page')
      else next.set('page', String(nextPage))
      return next
    })
  }

  // A page past the end (an old link, or the last bookmark on the last page was deleted): go to the real last page.
  if (!loading && result && result.data.length === 0 && result.total > 0) {
    return <Navigate to={`?page=${result.totalPages}`} replace />
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
        </div>
      </div>
    )
  } else {
    content = (
      <>
        <div className="panel">
          <ul className="bookmarks" aria-busy={loading}>
            {result.data.map((bookmark) => (
              <BookmarkRow key={bookmark.id} bookmark={bookmark} />
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
        <h1>Your bookmarks</h1>
      </div>
      <section className="results" aria-labelledby="results-heading">
        <h2 id="results-heading" className="vh">
          Bookmark list
        </h2>
        {content}
      </section>
    </>
  )
}

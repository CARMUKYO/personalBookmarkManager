type PagerProps = {
  page: number
  pageSize: number
  total: number
  totalPages: number
  shownCount: number // how many rows are on this page (the last page can have fewer than pageSize)
  disabled?: boolean // e.g. while the next page is loading
  onPageChange: (page: number) => void
}

// "Showing 21 to 40 of 57" with Previous and Next buttons that switch off at the first and last page.
export function Pager({ page, pageSize, total, totalPages, shownCount, disabled = false, onPageChange }: PagerProps) {
  const first = (page - 1) * pageSize + 1
  const last = first + shownCount - 1

  return (
    <nav className="pager" aria-label="Pagination">
      {/* aria-live: screen readers announce the new range after Previous or Next. */}
      <p aria-live="polite">
        Showing {first} to {last} of {total}
      </p>
      <div className="buttons">
        <button
          className="btn btn-secondary"
          type="button"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  )
}

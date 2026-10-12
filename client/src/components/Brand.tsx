import { Link } from 'react-router'

// The wordmark: a marigold ribbon and the word "Bookmarks". It links to the home page.
export function Brand() {
  return (
    <Link className="brand" to="/">
      <svg viewBox="0 0 20 26" aria-hidden="true">
        <path d="M0 2.5A2.5 2.5 0 0 1 2.5 0h15A2.5 2.5 0 0 1 20 2.5V26l-10-6.5L0 26z" />
      </svg>
      Bookmarks
    </Link>
  )
}

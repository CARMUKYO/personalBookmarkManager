import { Link } from 'react-router'
import { Brand } from '../components/Brand'

// Shown for any address the app doesn't know, e.g. /bookmarkz.
export function NotFoundPage() {
  return (
    <div className="simple-page">
      <header>
        <Brand />
      </header>
      <main>
        <div className="content">
          <h1>Page not found</h1>
          <p className="lede">There's nothing at this address. It may have been typed wrong.</p>
          <Link className="btn btn-primary" to="/">
            Go to your bookmarks
          </Link>
        </div>
      </main>
    </div>
  )
}

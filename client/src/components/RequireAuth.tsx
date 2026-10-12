import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../auth/useAuth'

// Wraps pages that need a logged-in user.
// Note: this only decides what the browser shows. The real protection is on the server,
// which checks the login cookie on every request; this just avoids showing a page that would fail.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="simple-page">
        <main>
          <p className="lede" role="status">
            Loading…
          </p>
        </main>
      </div>
    )
  }

  if (status === 'anonymous') {
    // Remember where the user wanted to go, so the login page can send them back there afterwards.
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return children
}

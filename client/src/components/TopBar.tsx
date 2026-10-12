import { useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { Brand } from './Brand'
import { ErrorIcon } from './ErrorIcon'

// The bar at the top of every logged-in page: logo on the left, who you are and "Log out" on the right.
export function TopBar() {
  const { user, logout } = useAuth()
  const [loggingOut, setLoggingOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogout() {
    setLoggingOut(true)
    setError(null)
    try {
      // Once this succeeds the auth status becomes 'anonymous' and RequireAuth sends us to /login.
      await logout()
    } catch {
      // Only the server can remove the httpOnly login cookie. If it couldn't be reached we are still logged in,
      // so say so instead of pretending: on a shared computer that difference matters.
      setError("Couldn't log out. Check your connection and try again.")
      setLoggingOut(false)
    }
  }

  return (
    <header className="topbar">
      <Brand />
      <div className="who">
        <span>{user?.email}</span>
        <button className="btn btn-secondary btn-small" type="button" onClick={handleLogout} disabled={loggingOut}>
          {loggingOut ? 'Logging out…' : 'Log out'}
        </button>
      </div>
      {error && (
        <p className="error-text topbar-error" role="alert">
          <ErrorIcon />
          <span>{error}</span>
        </p>
      )}
    </header>
  )
}

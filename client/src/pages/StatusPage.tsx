import { useEffect, useState } from 'react'
import { getHealth } from '../api/health'

// Temporary home page, shown inside AppLayout to logged-in users. The bookmark list replaces it in task 7.4.
export function StatusPage() {
  const [health, setHealth] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getHealth()
      .then((data) => setHealth(data.status))
      .catch((err: Error) => setError(err.message))
  }, [])

  return (
    <>
      <div className="page-head">
        <h1>Your bookmarks</h1>
      </div>
      <p>The bookmark list arrives in task 7.4.</p>
      {error && <p>API error: {error}</p>}
      {!error && health === null && <p>Checking API…</p>}
      {health && <p>API status: {health}</p>}
    </>
  )
}

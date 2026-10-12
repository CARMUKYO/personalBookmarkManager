import { useEffect, useState } from 'react'
import { getHealth } from './api/health'
import { useAuth } from './auth/useAuth'

// Temporary status page. The real screens (login, bookmarks) replace it in tasks 7.2 to 7.4.
function App() {
  const { user, status } = useAuth()
  const [health, setHealth] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getHealth()
      .then((data) => setHealth(data.status))
      .catch((err: Error) => setError(err.message))
  }, [])

  return (
    <main>
      <h1>Bookmark Manager</h1>
      {error && <p>API error: {error}</p>}
      {!error && health === null && <p>Checking API...</p>}
      {health && <p>API status: {health}</p>}
      {status === 'loading' && <p>Checking your session...</p>}
      {status === 'authenticated' && <p>Signed in as {user?.email}</p>}
      {status === 'anonymous' && <p>Not signed in</p>}
    </main>
  )
}

export default App

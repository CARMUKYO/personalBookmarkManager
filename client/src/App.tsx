import { useEffect, useState } from 'react'
import { getHealth } from './api/health'

function App() {
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getHealth()
      .then((data) => setStatus(data.status))
      .catch((err: Error) => setError(err.message))
  }, [])

  return (
    <main>
      <h1>Bookmark Manager</h1>
      {error && <p>API error: {error}</p>}
      {!error && status === null && <p>Checking API...</p>}
      {status && <p>API status: {status}</p>}
    </main>
  )
}

export default App

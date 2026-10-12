import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'

const alice = { id: 1, email: 'alice@example.com', createdAt: '2024-01-01T00:00:00.000Z' }

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const notLoggedIn = () => json(401, { error: { code: 'UNAUTHORIZED', message: 'Not logged in' } })

const emptyList = () => json(200, { data: [], page: 1, pageSize: 20, total: 0, totalPages: 0 })

// A fake server. `loggedIn` says what /me answers; /bookmarks answers `bookmarks` (a 401 there simulates an expired session).
function fakeServer({ loggedIn, bookmarks = emptyList }: { loggedIn: boolean; bookmarks?: () => Response }) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/auth/me') return loggedIn ? json(200, { user: alice }) : notLoggedIn()
    if (url === '/api/auth/logout') return new Response(null, { status: 204 })
    if (url.startsWith('/api/bookmarks')) return bookmarks()
    return json(404, { error: { code: 'NOT_FOUND', message: 'Not found' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

// MemoryRouter is a router that keeps the address in memory instead of the browser's address bar,
// so a test can start the app at any path.
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('App routing', () => {
  it('sends a logged-out visitor from the home page to sign in', async () => {
    fakeServer({ loggedIn: false })
    renderAt('/')

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByText(/Your session ended/)).not.toBeInTheDocument()
  })

  it('shows the home page with the top bar to a logged-in user', async () => {
    fakeServer({ loggedIn: true })
    renderAt('/')

    expect(await screen.findByRole('heading', { name: 'Your bookmarks' })).toBeInTheDocument()
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    expect(await screen.findByText('No bookmarks yet')).toBeInTheDocument()
  })

  it('logs out and goes to the sign-in page', async () => {
    const fetchMock = fakeServer({ loggedIn: true })
    renderAt('/')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Log out' }))

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }))
    // Logging out on purpose is not an expired session.
    expect(screen.queryByText(/Your session ended/)).not.toBeInTheDocument()
  })

  it('stays logged in and says so when logout fails', async () => {
    fakeServer({ loggedIn: true })
    renderAt('/')
    const user = userEvent.setup()
    await screen.findByRole('button', { name: 'Log out' })
    // From now on the server can't be reached.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await user.click(screen.getByRole('button', { name: 'Log out' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't log out")
    expect(screen.getByRole('heading', { name: 'Your bookmarks' })).toBeInTheDocument()
  })

  it('sends the user to sign in with a message when the session ends', async () => {
    // /me still says "logged in", but the next request is turned away: the token expired in between.
    fakeServer({ loggedIn: true, bookmarks: notLoggedIn })
    renderAt('/')

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Your session ended, please sign in again.')
  })

  it('shows "Page not found" for an unknown address, with a link home', async () => {
    fakeServer({ loggedIn: false })
    renderAt('/no-such-page')

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to your bookmarks' })).toHaveAttribute('href', '/')
    // Let the /me check finish so React doesn't warn about an update after the test.
    await screen.findByRole('link', { name: 'Bookmarks' })
  })
})

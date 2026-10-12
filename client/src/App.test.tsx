import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'

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
  beforeEach(() => {
    // /me answers "not logged in", /health answers "ok".
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/auth/me')
          ? new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Not logged in' } }), { status: 401 })
          : new Response(JSON.stringify({ status: 'ok' }), { status: 200 }),
      ),
    )
  })

  it('shows the home page at /', async () => {
    renderAt('/')
    expect(await screen.findByText('API status: ok')).toBeInTheDocument()
  })

  it('shows "Page not found" for an unknown address, with a link home', async () => {
    renderAt('/no-such-page')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to your bookmarks' })).toHaveAttribute('href', '/')
    // Let the /me check finish so React doesn't warn about an update after the test.
    await screen.findByRole('link', { name: 'Bookmarks' })
  })
})

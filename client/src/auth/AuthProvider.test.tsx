import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as authApi from '../api/auth'
import { ApiError } from '../api/http'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './useAuth'

// The provider is tested on its own logic, so the network layer is replaced with fakes.
vi.mock('../api/auth')

const alice = { id: 1, email: 'alice@example.com', createdAt: '2024-01-01T00:00:00.000Z' }

// A tiny page that shows what the provider holds and has a button for each action.
function Probe() {
  const { user, status, login, register, logout } = useAuth()
  const [error, setError] = useState('')
  const run = (action: Promise<void>) => action.catch((e: Error) => setError(e.message))

  return (
    <div>
      <p>status: {status}</p>
      <p>user: {user ? user.email : 'nobody'}</p>
      <p>error: {error || 'none'}</p>
      <button onClick={() => run(login('alice@example.com', 'password123'))}>log in</button>
      <button onClick={() => run(register('alice@example.com', 'password123'))}>sign up</button>
      <button onClick={() => run(logout())}>log out</button>
    </div>
  )
}

function renderProbe() {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('AuthProvider: restoring the session on page load', () => {
  it('starts as loading, then shows the user the server says is logged in', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue(alice)

    renderProbe()

    expect(screen.getByText('status: loading')).toBeInTheDocument()
    expect(await screen.findByText('status: authenticated')).toBeInTheDocument()
    expect(screen.getByText('user: alice@example.com')).toBeInTheDocument()
  })

  it('becomes anonymous when nobody is logged in', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue(null)

    renderProbe()

    expect(await screen.findByText('status: anonymous')).toBeInTheDocument()
    expect(screen.getByText('user: nobody')).toBeInTheDocument()
  })

  it('becomes anonymous, without crashing, when the server cannot be reached', async () => {
    vi.mocked(authApi.getMe).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'down'))

    renderProbe()

    expect(await screen.findByText('status: anonymous')).toBeInTheDocument()
  })
})

describe('AuthProvider: actions', () => {
  beforeEach(() => {
    vi.mocked(authApi.getMe).mockResolvedValue(null)
  })

  it('login stores the user', async () => {
    vi.mocked(authApi.login).mockResolvedValue(alice)
    renderProbe()
    await screen.findByText('status: anonymous')

    await userEvent.click(screen.getByRole('button', { name: 'log in' }))

    expect(await screen.findByText('status: authenticated')).toBeInTheDocument()
    expect(screen.getByText('user: alice@example.com')).toBeInTheDocument()
    expect(authApi.login).toHaveBeenCalledWith('alice@example.com', 'password123')
  })

  it('a failed login passes the error to the caller and stays anonymous', async () => {
    vi.mocked(authApi.login).mockRejectedValue(new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password'))
    renderProbe()
    await screen.findByText('status: anonymous')

    await userEvent.click(screen.getByRole('button', { name: 'log in' }))

    expect(await screen.findByText('error: Invalid email or password')).toBeInTheDocument()
    expect(screen.getByText('status: anonymous')).toBeInTheDocument()
    expect(screen.getByText('user: nobody')).toBeInTheDocument()
  })

  it('register creates the account and then logs in', async () => {
    vi.mocked(authApi.register).mockResolvedValue(alice)
    vi.mocked(authApi.login).mockResolvedValue(alice)
    renderProbe()
    await screen.findByText('status: anonymous')

    await userEvent.click(screen.getByRole('button', { name: 'sign up' }))

    expect(await screen.findByText('status: authenticated')).toBeInTheDocument()
    expect(authApi.register).toHaveBeenCalledWith('alice@example.com', 'password123')
    expect(authApi.login).toHaveBeenCalledWith('alice@example.com', 'password123')
  })

  it('a failed register (email taken) does not try to log in', async () => {
    vi.mocked(authApi.register).mockRejectedValue(new ApiError(409, 'EMAIL_TAKEN', 'Email already registered'))
    renderProbe()
    await screen.findByText('status: anonymous')

    await userEvent.click(screen.getByRole('button', { name: 'sign up' }))

    expect(await screen.findByText('error: Email already registered')).toBeInTheDocument()
    expect(authApi.login).not.toHaveBeenCalled()
    expect(screen.getByText('status: anonymous')).toBeInTheDocument()
  })

  it('logout clears the user', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue(alice)
    vi.mocked(authApi.logout).mockResolvedValue(undefined)
    renderProbe()
    await screen.findByText('status: authenticated')

    await userEvent.click(screen.getByRole('button', { name: 'log out' }))

    expect(await screen.findByText('status: anonymous')).toBeInTheDocument()
    expect(screen.getByText('user: nobody')).toBeInTheDocument()
  })

  it('a failed logout keeps the user signed in and reports the error', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue(alice)
    vi.mocked(authApi.logout).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server'))
    renderProbe()
    await screen.findByText('status: authenticated')

    await userEvent.click(screen.getByRole('button', { name: 'log out' }))

    expect(await screen.findByText('error: Could not reach the server')).toBeInTheDocument()
    expect(screen.getByText('status: authenticated')).toBeInTheDocument()
  })
})

describe('useAuth', () => {
  it('throws a clear error when used outside the provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<Probe />)).toThrow('useAuth must be used inside <AuthProvider>')

    consoleError.mockRestore()
  })
})

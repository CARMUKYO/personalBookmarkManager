import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as authApi from '../api/auth'
import { ApiError } from '../api/http'
import { AuthProvider } from '../auth/AuthProvider'
import { LoginPage } from './LoginPage'
import { RegisterPage } from './RegisterPage'

// The pages are tested against a fake network layer, so no server is needed.
vi.mock('../api/auth')

const alice = { id: 1, email: 'alice@example.com', createdAt: '2024-01-01T00:00:00.000Z' }

// Starts the app at `path`. "/" is a stand-in home page, so a redirect is easy to spot.
function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<p>Home page</p>} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(authApi.getMe).mockResolvedValue(null) // nobody is logged in at the start
})

describe('LoginPage', () => {
  it('shows an error message for a wrong password and stays on the page', async () => {
    vi.mocked(authApi.login).mockRejectedValue(new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password'))
    renderAt('/login')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Email'), 'alice@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The email or password is wrong')
    expect(authApi.login).toHaveBeenCalledWith('alice@example.com', 'wrong-password')
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('asks for missing fields without calling the server', async () => {
    renderAt('/login')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Sign in' }))

    expect(screen.getByText('Enter your email address')).toBeInTheDocument()
    expect(screen.getByText('Enter your password')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Email')).toHaveFocus()
    expect(authApi.login).not.toHaveBeenCalled()
  })

  it('goes to the home page after signing in', async () => {
    vi.mocked(authApi.login).mockResolvedValue(alice)
    renderAt('/login')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Email'), 'alice@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Home page')).toBeInTheDocument()
  })

  it('sends a user who is already logged in away from the login page', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue(alice)
    renderAt('/login')

    expect(await screen.findByText('Home page')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
  })
})

describe('RegisterPage', () => {
  it('checks the password length before calling the server', async () => {
    renderAt('/register')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Email'), 'new@example.com')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveFocus()
    expect(authApi.register).not.toHaveBeenCalled()
  })

  it('rejects an email address without a domain', async () => {
    renderAt('/register')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Email'), 'alice@')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(screen.getByText('Enter an email address like name@example.com')).toBeInTheDocument()
    expect(authApi.register).not.toHaveBeenCalled()
  })

  it('explains a taken email and links to sign in', async () => {
    vi.mocked(authApi.register).mockRejectedValue(
      new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists'),
    )
    renderAt('/register')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Email'), 'alice@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText(/An account with this email already exists/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in instead' })).toHaveAttribute('href', '/login')
  })

  it('shows server validation messages next to the right field', async () => {
    vi.mocked(authApi.register).mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', [{ path: 'email', message: 'Invalid email address' }]),
    )
    renderAt('/register')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Email'), 'alice@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Invalid email address')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
  })

  it('logs the new user in and goes to the home page', async () => {
    vi.mocked(authApi.register).mockResolvedValue(alice)
    vi.mocked(authApi.login).mockResolvedValue(alice)
    renderAt('/register')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Email'), 'alice@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Home page')).toBeInTheDocument()
  })
})

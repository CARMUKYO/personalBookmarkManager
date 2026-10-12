import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router'
import { ApiError } from '../api/http'
import { useAuth } from '../auth/useAuth'
import { AuthLayout } from '../components/AuthLayout'
import { ErrorIcon } from '../components/ErrorIcon'
import { Field } from '../components/Field'

type FieldErrors = { email?: ReactNode; password?: ReactNode }

// The same rules the server checks (server/src/routes/auth.ts). Checking here too gives instant feedback,
// but the server stays the one that decides: a user can always skip the browser and call the API directly.
function emailProblem(email: string): string | undefined {
  if (!email) return 'Enter your email address'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter an email address like name@example.com'
}

function passwordProblem(password: string): string | undefined {
  if (password.length < 8) return 'Password must be at least 8 characters'
  // bcrypt only uses the first 72 bytes. Accented letters and emoji take 2 to 4 bytes each, so count bytes, not letters.
  if (new TextEncoder().encode(password).length > 72) return 'Password is too long (72 bytes at most)'
}

export function RegisterPage() {
  const { status, register } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  if (status === 'loading') return null
  if (status === 'authenticated') return <Navigate to="/" replace />

  function showErrors(nextErrors: FieldErrors) {
    setErrors(nextErrors)
    if (nextErrors.email) emailRef.current?.focus()
    else if (nextErrors.password) passwordRef.current?.focus()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const nextErrors: FieldErrors = { email: emailProblem(email.trim()), password: passwordProblem(password) }
    showErrors(nextErrors)
    if (nextErrors.email || nextErrors.password) return

    setSubmitting(true)
    try {
      // register() also logs in, and then the redirect above takes over.
      await register(email.trim(), password)
    } catch (error) {
      setSubmitting(false)
      if (error instanceof ApiError && error.code === 'EMAIL_TAKEN') {
        showErrors({
          email: (
            <>
              An account with this email already exists. <Link to="/login">Sign in instead</Link>
            </>
          ),
        })
      } else if (error instanceof ApiError && error.details?.length) {
        // A 400 from the server: put each message next to the field it is about.
        const fromServer: FieldErrors = {}
        for (const detail of error.details) {
          if (detail.path === 'email' || detail.path === 'password') fromServer[detail.path] = detail.message
        }
        showErrors(fromServer)
      } else {
        setFormError(error instanceof Error ? error.message : 'Something went wrong. Please try again.')
      }
    }
  }

  return (
    <AuthLayout title="Create your account" lede="Your bookmarks are private to you.">
      {formError && (
        <div className="alert" role="alert">
          <ErrorIcon />
          <p>{formError}</p>
        </div>
      )}
      <form onSubmit={handleSubmit} noValidate>
        <Field
          ref={emailRef}
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          spellCheck={false}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <Field
          ref={passwordRef}
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 8 characters."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="auth-switch">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  )
}

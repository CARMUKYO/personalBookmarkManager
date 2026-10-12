import { useRef, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router'
import { ApiError } from '../api/http'
import { useAuth } from '../auth/useAuth'
import { AuthLayout } from '../components/AuthLayout'
import { ErrorIcon } from '../components/ErrorIcon'
import { Field } from '../components/Field'

type FieldErrors = { email?: string; password?: string }

export function LoginPage() {
  const { status, login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null) // an error about the whole form, e.g. wrong password
  const [submitting, setSubmitting] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  // Still asking the server whether we're logged in: show nothing rather than flash the form.
  if (status === 'loading') return null
  // Already logged in (or just logged in successfully): there's nothing to do here.
  if (status === 'authenticated') return <Navigate to="/" replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault() // stop the browser's own form submit, which would reload the page

    // Login only checks that both fields are filled in. The password rules belong to sign-up.
    const nextErrors: FieldErrors = {}
    if (!email.trim()) nextErrors.email = 'Enter your email address'
    if (!password) nextErrors.password = 'Enter your password'
    setErrors(nextErrors)
    setFormError(null)

    // Move the keyboard focus to the first field that needs fixing.
    if (nextErrors.email || nextErrors.password) {
      if (nextErrors.email) emailRef.current?.focus()
      else passwordRef.current?.focus()
      return
    }

    setSubmitting(true)
    try {
      await login(email.trim(), password)
      // No navigate() needed: the auth status is now 'authenticated', so the redirect above takes over.
    } catch (error) {
      setFormError(
        error instanceof ApiError && error.status === 401
          ? 'The email or password is wrong. Check them and try again.'
          : error instanceof Error
            ? error.message
            : 'Something went wrong. Please try again.',
      )
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title="Sign in" lede="Pick up where you left off.">
      {formError && (
        <div className="alert" role="alert">
          <ErrorIcon />
          <p>{formError}</p>
        </div>
      )}
      {/* noValidate turns off the browser's pop-up checks, so our own messages appear next to the fields instead. */}
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
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="auth-switch">
        New here? <Link to="/register">Create an account</Link>
      </p>
    </AuthLayout>
  )
}

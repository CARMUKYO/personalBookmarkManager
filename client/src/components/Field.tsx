import { useId, type ComponentProps, type ReactNode } from 'react'
import { ErrorIcon } from './ErrorIcon'

type FieldProps = ComponentProps<'input'> & {
  label: string
  hint?: string // always visible under the field, e.g. "At least 8 characters."
  error?: ReactNode // shown under the field and marks it invalid
}

// A labelled text input with an optional hint and error message.
// The hint and error are linked to the input with aria-describedby, so screen readers read them with the field.
export function Field({ label, hint, error, ...inputProps }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        className="input"
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...inputProps}
      />
      {error && (
        <p className="error-text" id={errorId}>
          <ErrorIcon />
          <span>{error}</span>
        </p>
      )}
      {hint && (
        <p className="hint" id={hintId}>
          {hint}
        </p>
      )}
    </div>
  )
}

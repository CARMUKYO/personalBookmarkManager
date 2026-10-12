import { useId, useState, type KeyboardEvent } from 'react'
import { createCategory } from '../api/categories'
import type { Category } from '../api/types'
import { categoryErrorMessage } from '../ui/categoryErrors'
import { ErrorIcon } from './ErrorIcon'

type NewCategoryFieldProps = {
  label: string
  onCreated: (category: Category) => void
}

// A name field with an "Add category" button. Used in "Manage categories" and inside the bookmark form.
// It is deliberately not its own <form>: inside the bookmark form, a nested form isn't allowed in HTML,
// so Enter is handled here instead (and stopped, so it doesn't save the bookmark).
export function NewCategoryField({ label, onCreated }: NewCategoryFieldProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const id = useId()

  async function add() {
    if (!name.trim()) {
      setError('Enter a name for the category')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const category = await createCategory(name.trim())
      setName('')
      onCreated(category)
    } catch (err) {
      setError(categoryErrorMessage(err, name))
    }
    setSaving(false)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      add()
    }
  }

  return (
    <div className="field">
      <label htmlFor={`${id}-name`}>{label}</label>
      <div className="inline-add">
        <input
          className="input"
          id={`${id}-name`}
          type="text"
          autoComplete="off"
          maxLength={50}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <button className="btn btn-secondary" type="button" onClick={add} disabled={saving}>
          {saving ? 'Adding…' : 'Add category'}
        </button>
      </div>
      {error && (
        <p className="error-text" id={`${id}-error`}>
          <ErrorIcon />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}

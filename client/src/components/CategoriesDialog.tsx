import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { deleteCategory, renameCategory } from '../api/categories'
import { ApiError } from '../api/http'
import type { Category } from '../api/types'
import { categoryErrorMessage } from '../ui/categoryErrors'
import { ErrorIcon } from './ErrorIcon'
import { Modal } from './Modal'
import { NewCategoryField } from './NewCategoryField'

type CategoriesDialogProps = {
  categories: Category[] | null // null while loading
  onClose: () => void
  onChanged: () => void // a category was added or renamed
  onDeleted: (id: number) => void
}

// "Manage categories": the list with Rename and Delete on each, and a field to add a new one.
// Rename and the delete question happen inside the row, so there is never a dialog on top of a dialog.
export function CategoriesDialog({ categories, onClose, onChanged, onDeleted }: CategoriesDialogProps) {
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [newName, setNewName] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null) // errors that don't belong to one field
  const id = useId()

  // When a row switches between viewing, renaming and confirming, its buttons are replaced.
  // This holds the id of the element that should get keyboard focus after that render, so focus isn't lost.
  const focusNext = useRef<string | null>(null)
  useEffect(() => {
    if (!focusNext.current) return
    document.getElementById(focusNext.current)?.focus()
    focusNext.current = null
  })

  const rowId = (categoryId: number, part: string) => `${id}-${part}-${categoryId}`

  function startRename(category: Category) {
    setRenamingId(category.id)
    setNewName(category.name)
    setRenameError(null)
    setConfirmingDeleteId(null)
    focusNext.current = rowId(category.id, 'name')
  }

  function stopRename(categoryId: number) {
    setRenamingId(null)
    focusNext.current = rowId(categoryId, 'rename')
  }

  async function saveRename(event: FormEvent<HTMLFormElement>, category: Category) {
    event.preventDefault()
    if (!newName.trim()) {
      setRenameError('Enter a name for the category')
      return
    }
    if (newName.trim() === category.name) {
      stopRename(category.id)
      return
    }
    setBusy(true)
    try {
      await renameCategory(category.id, newName.trim())
      stopRename(category.id)
      onChanged()
    } catch (err) {
      setRenameError(categoryErrorMessage(err, newName))
      focusNext.current = rowId(category.id, 'name')
    }
    setBusy(false)
  }

  function askDelete(category: Category) {
    setConfirmingDeleteId(category.id)
    setRenamingId(null)
    focusNext.current = rowId(category.id, 'keep') // the safe choice gets focus, like the bookmark delete dialog
  }

  function keepCategory(categoryId: number) {
    setConfirmingDeleteId(null)
    focusNext.current = rowId(categoryId, 'delete')
  }

  async function confirmDelete(category: Category) {
    setBusy(true)
    setError(null)
    try {
      await deleteCategory(category.id)
      setConfirmingDeleteId(null)
      onDeleted(category.id)
    } catch (err) {
      // 404: already deleted (e.g. in another tab). It's gone, which is what the user wanted.
      if (err instanceof ApiError && err.status === 404) {
        setConfirmingDeleteId(null)
        onDeleted(category.id)
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      }
    }
    setBusy(false)
    focusNext.current = `${id}-done`
  }

  return (
    <Modal labelledBy={`${id}-heading`} describedBy={`${id}-description`} onCancel={onClose} onClose={onClose}>
      <div className="dialog-body">
        <h2 id={`${id}-heading`}>Manage categories</h2>
        <p id={`${id}-description`}>Categories group your bookmarks. Deleting a category keeps its bookmarks.</p>
        {error && (
          <div className="alert" role="alert">
            <ErrorIcon />
            <p>{error}</p>
          </div>
        )}

        {categories === null ? (
          <p className="hint">Loading categories…</p>
        ) : categories.length === 0 ? (
          <p className="hint">No categories yet. Add your first one below.</p>
        ) : (
          <ul className="category-list">
            {categories.map((category) => (
              <li key={category.id}>
                {renamingId === category.id ? (
                  <form className="category-rename" onSubmit={(e) => saveRename(e, category)}>
                    <label className="vh" htmlFor={rowId(category.id, 'name')}>
                      New name for “{category.name}”
                    </label>
                    <input
                      className="input"
                      id={rowId(category.id, 'name')}
                      type="text"
                      autoComplete="off"
                      maxLength={50}
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      aria-invalid={renameError ? true : undefined}
                      aria-describedby={renameError ? rowId(category.id, 'error') : undefined}
                    />
                    <button className="btn btn-primary btn-small" type="submit" disabled={busy}>
                      Save
                    </button>
                    <button className="btn btn-quiet" type="button" onClick={() => stopRename(category.id)}>
                      Cancel
                    </button>
                    {renameError && (
                      <p className="error-text" id={rowId(category.id, 'error')}>
                        <ErrorIcon />
                        <span>{renameError}</span>
                      </p>
                    )}
                  </form>
                ) : confirmingDeleteId === category.id ? (
                  <div className="category-confirm" role="group" aria-label={`Delete ${category.name}?`}>
                    <p>
                      Delete “{category.name}”? Its bookmarks are kept.
                    </p>
                    <button
                      className="btn btn-secondary btn-small"
                      id={rowId(category.id, 'keep')}
                      type="button"
                      onClick={() => keepCategory(category.id)}
                    >
                      Keep
                    </button>
                    <button
                      className="btn btn-danger btn-small"
                      type="button"
                      onClick={() => confirmDelete(category)}
                      disabled={busy}
                    >
                      Delete category
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="category-name">{category.name}</span>
                    <button
                      className="btn btn-quiet"
                      id={rowId(category.id, 'rename')}
                      type="button"
                      aria-label={`Rename ${category.name}`}
                      onClick={() => startRename(category)}
                    >
                      Rename
                    </button>
                    <button
                      className="btn btn-quiet is-danger"
                      id={rowId(category.id, 'delete')}
                      type="button"
                      aria-label={`Delete ${category.name}`}
                      onClick={() => askDelete(category)}
                    >
                      Delete
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <NewCategoryField label="New category" onCreated={onChanged} />
      </div>
      <div className="dialog-actions">
        <button className="btn btn-primary" id={`${id}-done`} type="button" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  )
}

import { useId, useRef, useState, type FormEvent } from 'react'
import { createBookmark, updateBookmark } from '../api/bookmarks'
import { ApiError } from '../api/http'
import type { Bookmark, Category } from '../api/types'
import { ErrorIcon } from './ErrorIcon'
import { Field } from './Field'
import { Modal } from './Modal'
import { NewCategoryField } from './NewCategoryField'

type BookmarkDialogProps = {
  bookmark?: Bookmark // given: edit this bookmark. Left out: add a new one.
  categories: Category[] | null // the user's categories; null while they load
  categoriesFailed: boolean
  onCategoryCreated: () => void // a category was added from this form; the page reloads the list
  onClose: () => void // closed without saving
  onSaved: (bookmark: Bookmark) => void
}

type FieldErrors = { url?: string; title?: string; description?: string }

// Same rule as the server: only http and https links (a "javascript:" link would run code when clicked).
function urlProblem(url: string): string | undefined {
  if (!url) return 'Enter the web address'
  try {
    const { protocol } = new URL(url)
    if (protocol === 'http:' || protocol === 'https:') return undefined
  } catch {
    // not a valid address at all: fall through to the message below
  }
  return 'Enter a full web address that starts with http:// or https://'
}

function sameIds(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id))
}

export function BookmarkDialog({
  bookmark,
  categories,
  categoriesFailed,
  onCategoryCreated,
  onClose,
  onSaved,
}: BookmarkDialogProps) {
  const isEdit = bookmark !== undefined
  const initial = {
    url: bookmark?.url ?? '',
    title: bookmark?.title ?? '',
    description: bookmark?.description ?? '',
    categoryIds: bookmark?.categories.map((category) => category.id) ?? [],
  }

  const [url, setUrl] = useState(initial.url)
  const [title, setTitle] = useState(initial.title)
  const [description, setDescription] = useState(initial.description)
  const [categoryIds, setCategoryIds] = useState<number[]>(initial.categoryIds)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const urlRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const id = useId()

  const isDirty =
    url !== initial.url ||
    title !== initial.title ||
    description !== initial.description ||
    !sameIds(categoryIds, initial.categoryIds)

  // Cancel button and Escape. Ask first if something was typed, so a stray key press can't lose work.
  function requestClose() {
    if (isDirty && !window.confirm('Discard your changes to this bookmark?')) return
    onClose()
  }

  function toggleCategory(categoryId: number) {
    setCategoryIds((current) =>
      current.includes(categoryId) ? current.filter((id) => id !== categoryId) : [...current, categoryId],
    )
  }

  // A category made right here is ticked straight away: that's why it was made.
  function handleCategoryCreated(category: Category) {
    setCategoryIds((current) => [...current, category.id])
    onCategoryCreated()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const nextErrors: FieldErrors = {
      url: urlProblem(url.trim()),
      title: title.trim() ? undefined : 'Enter a title',
    }
    setErrors(nextErrors)
    if (nextErrors.url || nextErrors.title) {
      if (nextErrors.url) urlRef.current?.focus()
      else titleRef.current?.focus()
      return
    }

    setSaving(true)
    try {
      const input = {
        url: url.trim(),
        title: title.trim(),
        // An empty note is left out when adding, and sent as null when editing (which clears it).
        description: description.trim() || (isEdit ? null : undefined),
        categoryIds,
      }
      const saved = isEdit ? await updateBookmark(bookmark.id, input) : await createBookmark(input)
      onSaved(saved)
    } catch (error) {
      setSaving(false)
      // A 400 from the server: put each message next to its field. Anything else goes in the box at the top.
      const fromServer: FieldErrors = {}
      if (error instanceof ApiError) {
        for (const detail of error.details ?? []) {
          if (detail.path === 'url' || detail.path === 'title' || detail.path === 'description') {
            fromServer[detail.path] = detail.message
          }
        }
      }
      if (Object.keys(fromServer).length > 0) {
        setErrors(fromServer)
        if (fromServer.url) urlRef.current?.focus()
        else if (fromServer.title) titleRef.current?.focus()
      } else {
        setFormError(error instanceof Error ? error.message : 'Something went wrong. Please try again.')
      }
    }
  }

  const headingId = `${id}-heading`
  const noteId = `${id}-note`
  const noteErrorId = `${id}-note-error`

  return (
    <Modal labelledBy={headingId} onCancel={requestClose} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        <div className="dialog-body">
          <h2 id={headingId}>{isEdit ? 'Edit bookmark' : 'Add bookmark'}</h2>
          {formError && (
            <div className="alert" role="alert">
              <ErrorIcon />
              <p>{formError}</p>
            </div>
          )}
          <Field
            ref={urlRef}
            label="Address"
            name="url"
            type="url"
            placeholder="https://example.com/article"
            autoComplete="off"
            spellCheck={false}
            maxLength={2048}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            error={errors.url}
          />
          <Field
            ref={titleRef}
            label="Title"
            name="title"
            type="text"
            autoComplete="off"
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={errors.title}
          />
          <div className="field">
            <label htmlFor={noteId}>
              Note <span className="hint">(optional)</span>
            </label>
            <textarea
              className="textarea"
              id={noteId}
              name="description"
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-invalid={errors.description ? true : undefined}
              aria-describedby={errors.description ? noteErrorId : undefined}
            />
            {errors.description && (
              <p className="error-text" id={noteErrorId}>
                <ErrorIcon />
                <span>{errors.description}</span>
              </p>
            )}
          </div>
          <fieldset className="field">
            <legend>
              Categories <span className="hint">(optional)</span>
            </legend>
            {categoriesFailed ? (
              <p className="hint">Couldn't load your categories. You can still save the bookmark without them.</p>
            ) : categories === null ? (
              <p className="hint">Loading categories…</p>
            ) : categories.length === 0 ? (
              <p className="hint">No categories yet. Add one below.</p>
            ) : (
              <div className="checks">
                {categories.map((category) => (
                  <span className="check" key={category.id}>
                    <input
                      type="checkbox"
                      id={`${id}-category-${category.id}`}
                      checked={categoryIds.includes(category.id)}
                      onChange={() => toggleCategory(category.id)}
                    />
                    <label htmlFor={`${id}-category-${category.id}`}>{category.name}</label>
                  </span>
                ))}
              </div>
            )}
            <NewCategoryField label="New category" onCreated={handleCategoryCreated} />
          </fieldset>
        </div>
        <div className="dialog-actions">
          <button className="btn btn-secondary" type="button" onClick={requestClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save bookmark'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

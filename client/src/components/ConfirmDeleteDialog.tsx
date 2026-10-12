import { useId, useState } from 'react'
import { deleteBookmark } from '../api/bookmarks'
import { ApiError } from '../api/http'
import type { Bookmark } from '../api/types'
import { ErrorIcon } from './ErrorIcon'
import { Modal } from './Modal'

type ConfirmDeleteDialogProps = {
  bookmark: Bookmark
  onClose: () => void // closed without deleting
  onDeleted: () => void
}

// "Delete “React reference”?" with Keep and Delete buttons. Names the bookmark so the user knows which one.
export function ConfirmDeleteDialog({ bookmark, onClose, onDeleted }: ConfirmDeleteDialogProps) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useId()

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await deleteBookmark(bookmark.id)
      onDeleted()
    } catch (err) {
      // 404: it was already deleted (say, in another tab). The user wanted it gone, and it is.
      if (err instanceof ApiError && err.status === 404) {
        onDeleted()
        return
      }
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setDeleting(false)
    }
  }

  return (
    <Modal labelledBy={`${id}-heading`} describedBy={`${id}-description`} onCancel={onClose} onClose={onClose}>
      <div className="dialog-body">
        <h2 id={`${id}-heading`}>Delete “{bookmark.title}”?</h2>
        <p id={`${id}-description`}>This removes the bookmark for good. Its categories stay.</p>
        {error && (
          <div className="alert" role="alert">
            <ErrorIcon />
            <p>{error}</p>
          </div>
        )}
      </div>
      <div className="dialog-actions">
        <button className="btn btn-secondary" type="button" onClick={onClose}>
          Keep bookmark
        </button>
        <button className="btn btn-danger" type="button" onClick={handleDelete} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete bookmark'}
        </button>
      </div>
    </Modal>
  )
}

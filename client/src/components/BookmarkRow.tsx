import { Link } from 'react-router'
import type { Bookmark } from '../api/types'
import { displayHost, savedLabel } from '../ui/format'
import { tileFor } from '../ui/tile'

type BookmarkRowProps = {
  bookmark: Bookmark
  onEdit: (bookmark: Bookmark) => void
  onDelete: (bookmark: Bookmark) => void
  categoryHref: (categoryId: number) => string // where a category chip links to: the list filtered by it
}

// One bookmark in the list: tile, title link, hostname and date, note, categories, then Edit and Delete.
export function BookmarkRow({ bookmark, onEdit, onDelete, categoryHref }: BookmarkRowProps) {
  const tile = tileFor(bookmark.url)

  return (
    <li>
      <span className="tile" data-hue={tile.hue} aria-hidden="true">
        {tile.letter}
      </span>
      <div className="row-body">
        <h3 className="row-title">
          {/* noopener: the other site can't control this tab. noreferrer: it isn't told which page linked to it. */}
          <a href={bookmark.url} target="_blank" rel="noopener noreferrer">
            {bookmark.title}
            <span className="vh"> (opens in a new tab)</span>
          </a>
        </h3>
        <p className="row-meta">
          <span>{displayHost(bookmark.url)}</span>
          <time dateTime={bookmark.createdAt}>{savedLabel(bookmark.createdAt)}</time>
        </p>
        {bookmark.description && <p className="row-note">{bookmark.description}</p>}
        {bookmark.categories.length > 0 && (
          <ul className="chips" aria-label="Categories">
            {bookmark.categories.map((category) => (
              <li key={category.id}>
                <Link to={categoryHref(category.id)} aria-label={`Show bookmarks in ${category.name}`}>
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="row-actions">
        {/* Every row has an "Edit" button, so the label adds the title: screen reader users hear "Edit React reference". */}
        <button className="btn btn-quiet" type="button" aria-label={`Edit ${bookmark.title}`} onClick={() => onEdit(bookmark)}>
          Edit
        </button>
        <button
          className="btn btn-quiet is-danger"
          type="button"
          aria-label={`Delete ${bookmark.title}`}
          onClick={() => onDelete(bookmark)}
        >
          Delete
        </button>
      </div>
    </li>
  )
}

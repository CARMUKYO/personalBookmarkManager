import type { Bookmark } from '../api/types'
import { displayHost, savedLabel } from '../ui/format'
import { tileFor } from '../ui/tile'

// One bookmark in the list: tile, title link, hostname and date, note, categories.
// Edit and Delete buttons are added in task 7.5.
export function BookmarkRow({ bookmark }: { bookmark: Bookmark }) {
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
              <li key={category.id}>{category.name}</li>
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}

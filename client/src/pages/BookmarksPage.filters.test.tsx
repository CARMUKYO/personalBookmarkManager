import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listBookmarks, type ListBookmarksParams } from '../api/bookmarks'
import { listCategories } from '../api/categories'
import type { Bookmark } from '../api/types'
import { BookmarksPage } from './BookmarksPage'

vi.mock('../api/bookmarks')
vi.mock('../api/categories')

const dev = { id: 1, name: 'Dev' }
const reading = { id: 2, name: 'Reading' }

const all: Bookmark[] = [
  { id: 1, url: 'https://css-tricks.com/', title: 'CSS Tricks', description: null, createdAt: '2026-10-03T09:00:00.000Z', updatedAt: '2026-10-03T09:00:00.000Z', categories: [dev] },
  { id: 2, url: 'https://react.dev/', title: 'React', description: null, createdAt: '2026-10-02T09:00:00.000Z', updatedAt: '2026-10-02T09:00:00.000Z', categories: [dev, reading] },
  { id: 3, url: 'https://example.com/', title: 'Novel', description: 'A good book', createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z', categories: [reading] },
]

// A fake server that really filters, so the page shows what a search would show.
function fakeServer(bookmarks: Bookmark[]) {
  vi.mocked(listBookmarks).mockImplementation(async ({ page = 1, q, categoryId }: ListBookmarksParams = {}) => {
    const data = bookmarks.filter(
      (b) =>
        (!q || b.title.toLowerCase().includes(q.toLowerCase())) &&
        (!categoryId || b.categories.some((c) => c.id === categoryId)),
    )
    return { data, page, pageSize: 20, total: data.length, totalPages: Math.ceil(data.length / 20) }
  })
}

function CurrentAddress() {
  const location = useLocation()
  return <p data-testid="address">{location.pathname + location.search}</p>
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<BookmarksPage />} />
      </Routes>
      <CurrentAddress />
    </MemoryRouter>,
  )
}

const address = () => screen.getByTestId('address').textContent
// The search texts the page actually sent to the server, in order.
const searchesSent = () => vi.mocked(listBookmarks).mock.calls.map(([params]) => params?.q).filter(Boolean)

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listCategories).mockResolvedValue([dev, reading])
  fakeServer(all)
})

describe('search', () => {
  it('waits until typing pauses, then searches once and goes back to page 1', async () => {
    renderAt('/?page=2')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Search bookmarks'), 'react')
    expect(searchesSent()).toEqual([]) // nothing sent while typing

    await waitFor(() => expect(address()).toBe('/?q=react'))
    expect(await screen.findByText('1 bookmark matches “react”')).toBeInTheDocument()
    expect(searchesSent()).toEqual(['react']) // not "r", "re", "rea"...
    expect(screen.queryByRole('link', { name: /CSS Tricks/ })).not.toBeInTheDocument()
  })

  it('keeps a trailing space in the box while the user is still typing', async () => {
    renderAt('/')
    const user = userEvent.setup()
    const box = await screen.findByLabelText('Search bookmarks')

    await user.type(box, 'cs')
    await waitFor(() => expect(address()).toBe('/?q=cs'))
    await user.type(box, 's ') // pause after a space, e.g. before typing "css tricks"
    await waitFor(() => expect(address()).toBe('/?q=css'))

    expect(box).toHaveValue('css ') // not trimmed away under the user's cursor
  })

  it('searches right away when Enter is pressed', async () => {
    renderAt('/')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Search bookmarks'), 'novel{Enter}')
    expect(address()).toBe('/?q=novel')
  })

  it('says what was searched when nothing matches, and "Clear search" brings everything back', async () => {
    renderAt('/?q=kubernetes')
    const user = userEvent.setup()

    expect(await screen.findByRole('heading', { name: 'No bookmarks match “kubernetes”' })).toBeInTheDocument()
    expect(screen.getByLabelText('Search bookmarks')).toHaveValue('kubernetes')

    await user.click(screen.getByRole('button', { name: 'Clear search' }))

    expect(await screen.findByRole('link', { name: /CSS Tricks/ })).toBeInTheDocument()
    expect(address()).toBe('/')
    expect(screen.getByLabelText('Search bookmarks')).toHaveValue('')
  })
})

describe('category and sort', () => {
  it('filters by category and goes back to page 1', async () => {
    renderAt('/?page=2&sort=title')
    const user = userEvent.setup()

    await screen.findByRole('option', { name: 'Dev' }) // categories have loaded
    await user.selectOptions(screen.getByLabelText('Category'), 'Dev')

    expect(address()).toBe('/?sort=title&categoryId=1')
    expect(listBookmarks).toHaveBeenLastCalledWith({ page: 1, q: undefined, categoryId: 1, sort: 'title' })
    await waitFor(() => expect(screen.queryByRole('link', { name: /Novel/ })).not.toBeInTheDocument())
  })

  it('changes the sort and goes back to page 1', async () => {
    renderAt('/?page=3')
    const user = userEvent.setup()

    await user.selectOptions(await screen.findByLabelText('Sort by'), 'Title A to Z')

    expect(address()).toBe('/?sort=title')
    expect(listBookmarks).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, sort: 'title' }))
  })

  it('makes each category chip a link that filters by it', async () => {
    renderAt('/?q=re')

    const chip = await screen.findByRole('link', { name: 'Show bookmarks in Reading' })
    expect(chip).toHaveAttribute('href', '/?q=re&categoryId=2')
  })

  it('offers "Show all bookmarks" when a category has none', async () => {
    fakeServer([])
    renderAt('/?categoryId=2')

    expect(await screen.findByRole('heading', { name: 'No bookmarks in “Reading”' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show all bookmarks' })).toBeInTheDocument()
  })
})

describe('the address keeps the filters', () => {
  it('starts with every filter from the address, as after a reload', async () => {
    renderAt('/?q=css&categoryId=1&sort=oldest&page=2')

    await waitFor(() =>
      expect(listBookmarks).toHaveBeenCalledWith({ page: 2, q: 'css', categoryId: 1, sort: 'oldest' }),
    )
    expect(screen.getByLabelText('Search bookmarks')).toHaveValue('css')
    expect(screen.getByLabelText('Sort by')).toHaveValue('oldest')
    await waitFor(() => expect(screen.getByLabelText('Category')).toHaveValue('1'))
  })
})

describe('toolbar visibility', () => {
  it('is hidden for a new user with no bookmarks and no filters', async () => {
    fakeServer([])
    renderAt('/')

    expect(await screen.findByText('No bookmarks yet')).toBeInTheDocument()
    expect(screen.queryByRole('search')).not.toBeInTheDocument()
  })

  it('stays visible when filters hide every bookmark, so they can be changed', async () => {
    fakeServer([])
    renderAt('/?q=nothing')

    expect(await screen.findByRole('heading', { name: 'No bookmarks match “nothing”' })).toBeInTheDocument()
    expect(screen.getByRole('search')).toBeInTheDocument()
  })
})

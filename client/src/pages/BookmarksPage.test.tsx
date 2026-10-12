import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listBookmarks } from '../api/bookmarks'
import { ApiError } from '../api/http'
import type { Bookmark, Page } from '../api/types'
import { BookmarksPage } from './BookmarksPage'

vi.mock('../api/bookmarks')

function makeBookmark(id: number, overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id,
    url: `https://site${id}.example.com/article`,
    title: `Bookmark ${id}`,
    description: null,
    createdAt: '2026-10-03T09:00:00.000Z',
    updatedAt: '2026-10-03T09:00:00.000Z',
    categories: [],
    ...overrides,
  }
}

// A fake server with `total` bookmarks, 2 per page, so paging is easy to test.
function fakeList(total: number) {
  const pageSize = 2
  vi.mocked(listBookmarks).mockImplementation(async ({ page = 1 } = {}) => {
    const all = Array.from({ length: total }, (_, i) => makeBookmark(i + 1))
    const data = all.slice((page - 1) * pageSize, page * pageSize)
    return { data, page, pageSize, total, totalPages: Math.ceil(total / pageSize) } satisfies Page<Bookmark>
  })
}

// Shows the current address, so tests can check the ?page= value.
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

beforeEach(() => {
  vi.resetAllMocks()
})

describe('BookmarksPage', () => {
  it('shows each bookmark with its link, hostname, note and categories', async () => {
    vi.mocked(listBookmarks).mockResolvedValue({
      data: [
        makeBookmark(1, {
          url: 'https://www.react.dev/learn',
          title: 'React reference',
          description: 'Official docs',
          categories: [{ id: 7, name: 'Dev' }],
        }),
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    })
    renderAt('/')

    const link = await screen.findByRole('link', { name: /React reference/ })
    expect(link).toHaveAttribute('href', 'https://www.react.dev/learn')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByText('react.dev')).toBeInTheDocument()
    expect(screen.getByText('Official docs')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Categories' })).getByText('Dev')).toBeInTheDocument()
  })

  it('shows a loading message first', async () => {
    fakeList(1)
    renderAt('/')
    expect(screen.getByText('Loading bookmarks…')).toBeInTheDocument()
    await screen.findByText('Bookmark 1')
  })

  it('pages with Previous and Next, which switch off at the ends', async () => {
    fakeList(5) // 3 pages: 2 + 2 + 1
    renderAt('/')
    const user = userEvent.setup()

    await screen.findByText('Bookmark 1')
    expect(screen.getByText('Showing 1 to 2 of 5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Bookmark 3')).toBeInTheDocument()
    expect(screen.getByTestId('address')).toHaveTextContent('/?page=2')
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Bookmark 5')).toBeInTheDocument()
    expect(screen.getByText('Showing 5 to 5 of 5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(await screen.findByText('Bookmark 3')).toBeInTheDocument()
  })

  it('starts on the page in the address (so reload and Back keep it)', async () => {
    fakeList(5)
    renderAt('/?page=2')

    expect(await screen.findByText('Bookmark 3')).toBeInTheDocument()
    expect(listBookmarks).toHaveBeenCalledWith({ page: 2 })
  })

  it('moves to the last real page when the address points past the end', async () => {
    fakeList(5)
    renderAt('/?page=99')

    expect(await screen.findByText('Bookmark 5')).toBeInTheDocument()
    expect(screen.getByTestId('address')).toHaveTextContent('/?page=3')
  })

  it('shows the empty state to a new user', async () => {
    fakeList(0)
    renderAt('/')

    expect(await screen.findByRole('heading', { name: 'No bookmarks yet' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument()
  })

  it('shows an error when loading fails, and "Try again" loads again', async () => {
    vi.mocked(listBookmarks).mockRejectedValueOnce(
      new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection and try again.'),
    )
    renderAt('/')
    const user = userEvent.setup()

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your bookmarks")

    fakeList(1) // the server is back
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Bookmark 1')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

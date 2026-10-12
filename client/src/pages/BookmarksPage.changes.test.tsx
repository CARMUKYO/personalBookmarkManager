import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBookmark, deleteBookmark, listBookmarks, updateBookmark } from '../api/bookmarks'
import { listCategories } from '../api/categories'
import { ApiError } from '../api/http'
import type { Bookmark } from '../api/types'
import { BookmarksPage } from './BookmarksPage'

vi.mock('../api/bookmarks')
vi.mock('../api/categories')

const categories = [
  { id: 1, name: 'Dev' },
  { id: 2, name: 'Reading' },
]

// A tiny in-memory server. Adding, editing and deleting change `stored`, and the list is read back from it,
// so these tests prove the page really loads the list again after each change.
let stored: Bookmark[] = []
let nextId = 1

function makeBookmark(title: string, overrides: Partial<Bookmark> = {}): Bookmark {
  const id = nextId++
  return {
    id,
    url: `https://site${id}.example.com/`,
    title,
    description: null,
    createdAt: '2026-10-03T09:00:00.000Z',
    updatedAt: '2026-10-03T09:00:00.000Z',
    categories: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  stored = []
  nextId = 1

  vi.mocked(listCategories).mockResolvedValue(categories)
  vi.mocked(listBookmarks).mockImplementation(async () => ({
    data: [...stored],
    page: 1,
    pageSize: 20,
    total: stored.length,
    totalPages: Math.ceil(stored.length / 20),
  }))
  vi.mocked(createBookmark).mockImplementation(async (input) => {
    const bookmark = makeBookmark(input.title, {
      url: input.url,
      description: input.description ?? null,
      categories: categories.filter((c) => input.categoryIds?.includes(c.id)),
    })
    stored.unshift(bookmark) // newest first
    return bookmark
  })
  vi.mocked(updateBookmark).mockImplementation(async (id, changes) => {
    // A new object, like a real server's answer: the page only sees the change if it loads the list again.
    const updated = {
      ...stored.find((b) => b.id === id)!,
      ...changes,
      description: changes.description ?? null,
      categories: categories.filter((c) => changes.categoryIds?.includes(c.id)),
    }
    stored = stored.map((b) => (b.id === id ? updated : b))
    return updated
  })
  vi.mocked(deleteBookmark).mockImplementation(async (id) => {
    stored = stored.filter((b) => b.id !== id)
  })
})

afterEach(() => {
  vi.restoreAllMocks() // undoes the window.confirm spies
})

function renderPage() {
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<BookmarksPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('adding a bookmark', () => {
  it('saves it from the empty state and shows it in the list', async () => {
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Add your first bookmark' }))
    const dialog = screen.getByRole('dialog', { name: 'Add bookmark' })
    await user.type(within(dialog).getByLabelText('Address'), 'https://react.dev/learn')
    await user.type(within(dialog).getByLabelText('Title'), 'React docs')
    await user.click(await within(dialog).findByRole('checkbox', { name: 'Dev' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save bookmark' }))

    expect(createBookmark).toHaveBeenCalledWith({
      url: 'https://react.dev/learn',
      title: 'React docs',
      description: null,
      categoryIds: [1],
    })
    expect(await screen.findByRole('link', { name: /React docs/ })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Bookmark added')).toBeInTheDocument()
  })

  it('checks the address before calling the server', async () => {
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Add bookmark' }))
    await user.type(screen.getByLabelText('Address'), 'example.com/article')
    await user.type(screen.getByLabelText('Title'), 'Example')
    await user.click(screen.getByRole('button', { name: 'Save bookmark' }))

    expect(screen.getByText('Enter a full web address that starts with http:// or https://')).toBeInTheDocument()
    expect(screen.getByLabelText('Address')).toHaveFocus()
    expect(createBookmark).not.toHaveBeenCalled()
  })

  it('shows a server validation error next to the field and keeps the dialog open', async () => {
    vi.mocked(createBookmark).mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', [{ path: 'title', message: 'Title is too long' }]),
    )
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Add bookmark' }))
    await user.type(screen.getByLabelText('Address'), 'https://example.com')
    await user.type(screen.getByLabelText('Title'), 'Example')
    await user.click(screen.getByRole('button', { name: 'Save bookmark' }))

    expect(await screen.findByText('Title is too long')).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('dialog', { name: 'Add bookmark' })).toBeInTheDocument()
  })

  it('says when there are no categories yet', async () => {
    vi.mocked(listCategories).mockResolvedValue([])
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Add bookmark' }))
    expect(await screen.findByText('No categories yet. Add one below.')).toBeInTheDocument()
  })
})

describe('closing the add/edit dialog', () => {
  // Browsers fire a 'cancel' event on the dialog when Escape is pressed.
  const pressEscape = () => fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))

  it('closes on Escape without asking when nothing was typed', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Add bookmark' }))
    pressEscape()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('asks before throwing away typed changes, and stays open if the user says no', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Add bookmark' }))
    await user.type(screen.getByLabelText('Title'), 'Half-typed')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(confirm).toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Half-typed')

    confirm.mockReturnValue(true)
    pressEscape()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(createBookmark).not.toHaveBeenCalled()
  })
})

describe('editing a bookmark', () => {
  it('opens the form filled in, saves the changes and shows them in the list', async () => {
    stored = [makeBookmark('Old title', { description: 'Old note', categories: [categories[1]] })]
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Edit Old title' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit bookmark' })
    expect(within(dialog).getByLabelText('Title')).toHaveValue('Old title')
    expect(within(dialog).getByLabelText(/Note/)).toHaveValue('Old note')
    expect(await within(dialog).findByRole('checkbox', { name: 'Reading' })).toBeChecked()

    await user.clear(within(dialog).getByLabelText('Title'))
    await user.type(within(dialog).getByLabelText('Title'), 'New title')
    await user.clear(within(dialog).getByLabelText(/Note/))
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(updateBookmark).toHaveBeenCalledWith(1, {
      url: 'https://site1.example.com/',
      title: 'New title',
      description: null, // an emptied note is sent as null, which clears it
      categoryIds: [2],
    })
    expect(await screen.findByRole('link', { name: /New title/ })).toBeInTheDocument()
    expect(screen.queryByText('Old title')).not.toBeInTheDocument()
    expect(screen.getByText('Changes saved')).toBeInTheDocument()
  })
})

describe('deleting a bookmark', () => {
  it('asks first, removes it from the list, and moves focus to the next row', async () => {
    stored = [makeBookmark('First'), makeBookmark('Second'), makeBookmark('Third')]
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Delete Second' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete “Second”?' })
    expect(dialog).toHaveTextContent('Its categories stay.')
    await user.click(within(dialog).getByRole('button', { name: 'Delete bookmark' }))

    expect(deleteBookmark).toHaveBeenCalledWith(2)
    // "Third" is on screen from the start, so wait for the focus itself to move (after the list reloads).
    await waitFor(() => expect(screen.getByRole('link', { name: /Third/ })).toHaveFocus())
    expect(screen.queryByRole('link', { name: /Second/ })).not.toBeInTheDocument()
    expect(screen.getByText('Bookmark deleted')).toBeInTheDocument()
  })

  it('keeps the bookmark when the user chooses "Keep bookmark"', async () => {
    stored = [makeBookmark('Precious')]
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Delete Precious' }))
    await user.click(screen.getByRole('button', { name: 'Keep bookmark' }))

    expect(deleteBookmark).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Precious/ })).toBeInTheDocument()
  })

  it('moves focus to the heading after deleting the only bookmark', async () => {
    stored = [makeBookmark('Lonely')]
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Delete Lonely' }))
    await user.click(screen.getByRole('button', { name: 'Delete bookmark' }))

    expect(await screen.findByText('No bookmarks yet')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Your bookmarks' })).toHaveFocus()
  })

  it('shows an error in the dialog if the delete fails', async () => {
    stored = [makeBookmark('Sticky')]
    vi.mocked(deleteBookmark).mockRejectedValue(
      new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection and try again.'),
    )
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Delete Sticky' }))
    await user.click(screen.getByRole('button', { name: 'Delete bookmark' }))

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Could not reach the server')
    expect(screen.getByRole('button', { name: 'Delete bookmark' })).toBeEnabled()
  })
})

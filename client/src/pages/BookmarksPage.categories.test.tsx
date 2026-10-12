import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBookmark, listBookmarks } from '../api/bookmarks'
import { createCategory, deleteCategory, listCategories, renameCategory } from '../api/categories'
import { ApiError } from '../api/http'
import type { Bookmark, Category } from '../api/types'
import { BookmarksPage } from './BookmarksPage'

vi.mock('../api/bookmarks')
vi.mock('../api/categories')

// A small fake server. Bookmarks store category ids, and the names are looked up when the list is read,
// like the real database. So renaming or deleting a category shows up on the bookmarks after a reload.
let categories: Category[] = []
let bookmarks: (Omit<Bookmark, 'categories'> & { categoryIds: number[] })[] = []
let nextId = 100

const sortByName = (list: Category[]) => [...list].sort((a, b) => a.name.localeCompare(b.name))
const taken = () => new ApiError(409, 'CATEGORY_NAME_TAKEN', 'You already have a category with this name')

beforeEach(() => {
  vi.resetAllMocks()
  nextId = 100
  categories = [
    { id: 1, name: 'Dev' },
    { id: 2, name: 'Reading' },
  ]
  bookmarks = [
    { id: 10, url: 'https://react.dev/', title: 'React docs', description: null, createdAt: '2026-10-03T09:00:00.000Z', updatedAt: '2026-10-03T09:00:00.000Z', categoryIds: [1] },
  ]

  vi.mocked(listCategories).mockImplementation(async () => sortByName(categories))
  vi.mocked(createCategory).mockImplementation(async (name) => {
    if (categories.some((c) => c.name === name)) throw taken()
    const category = { id: nextId++, name }
    categories.push(category)
    return category
  })
  vi.mocked(renameCategory).mockImplementation(async (id, name) => {
    if (categories.some((c) => c.name === name && c.id !== id)) throw taken()
    categories = categories.map((c) => (c.id === id ? { id, name } : c))
    return { id, name }
  })
  vi.mocked(deleteCategory).mockImplementation(async (id) => {
    categories = categories.filter((c) => c.id !== id)
    bookmarks = bookmarks.map((b) => ({ ...b, categoryIds: b.categoryIds.filter((c) => c !== id) }))
  })
  vi.mocked(listBookmarks).mockImplementation(async ({ categoryId } = {}) => {
    const data = bookmarks
      .filter((b) => !categoryId || b.categoryIds.includes(categoryId))
      .map(({ categoryIds, ...b }) => ({ ...b, categories: categories.filter((c) => categoryIds.includes(c.id)) }))
    return { data, page: 1, pageSize: 20, total: data.length, totalPages: 1 }
  })
  vi.mocked(createBookmark).mockImplementation(async (input) => {
    const bookmark = { id: nextId++, url: input.url, title: input.title, description: null, createdAt: '2026-10-04T09:00:00.000Z', updatedAt: '2026-10-04T09:00:00.000Z', categoryIds: input.categoryIds ?? [] }
    bookmarks.unshift(bookmark)
    return { ...bookmark, categories: [] }
  })
})

function CurrentAddress() {
  const location = useLocation()
  return <p data-testid="address">{location.pathname + location.search}</p>
}

function renderAt(path = '/') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<BookmarksPage />} />
      </Routes>
      <CurrentAddress />
    </MemoryRouter>,
  )
}

async function openManageCategories(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Manage categories' }))
  return screen.getByRole('dialog', { name: 'Manage categories' })
}

const filterOptions = () => within(screen.getByLabelText('Category')).getAllByRole('option').map((o) => o.textContent)

describe('Manage categories', () => {
  it('adds a category, which appears in the filter dropdown without a reload', async () => {
    renderAt()
    const user = userEvent.setup()
    const dialog = await openManageCategories(user)

    await user.type(within(dialog).getByLabelText('New category'), 'Recipes')
    await user.click(within(dialog).getByRole('button', { name: 'Add category' }))

    expect(createCategory).toHaveBeenCalledWith('Recipes')
    expect(await within(dialog).findByText('Recipes')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('New category')).toHaveValue('') // ready for the next one
    expect(filterOptions()).toEqual(['All categories', 'Dev', 'Reading', 'Recipes'])
  })

  it('explains a duplicate name next to the field', async () => {
    renderAt()
    const user = userEvent.setup()
    const dialog = await openManageCategories(user)

    await user.type(within(dialog).getByLabelText('New category'), 'Dev{Enter}')

    expect(await within(dialog).findByText('You already have a category called “Dev”')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('New category')).toHaveAttribute('aria-invalid', 'true')
  })

  it('renames a category, and the bookmark chips show the new name', async () => {
    renderAt()
    const user = userEvent.setup()
    expect(await screen.findByRole('link', { name: 'Show bookmarks in Dev' })).toBeInTheDocument()
    const dialog = await openManageCategories(user)

    await user.click(within(dialog).getByRole('button', { name: 'Rename Dev' }))
    const nameField = within(dialog).getByLabelText('New name for “Dev”')
    expect(nameField).toHaveFocus()
    await user.clear(nameField)
    await user.type(nameField, 'Programming{Enter}')

    expect(renameCategory).toHaveBeenCalledWith(1, 'Programming')
    expect(await screen.findByRole('link', { name: 'Show bookmarks in Programming' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Rename Programming' })).toHaveFocus()
  })

  it('shows a duplicate-name error when renaming', async () => {
    renderAt()
    const user = userEvent.setup()
    const dialog = await openManageCategories(user)

    await user.click(within(dialog).getByRole('button', { name: 'Rename Dev' }))
    await user.clear(within(dialog).getByLabelText('New name for “Dev”'))
    await user.type(within(dialog).getByLabelText('New name for “Dev”'), 'Reading{Enter}')

    expect(await within(dialog).findByText('You already have a category called “Reading”')).toBeInTheDocument()
  })

  it('asks before deleting, and "Keep" cancels', async () => {
    renderAt()
    const user = userEvent.setup()
    const dialog = await openManageCategories(user)

    await user.click(within(dialog).getByRole('button', { name: 'Delete Reading' }))
    expect(within(dialog).getByText('Delete “Reading”? Its bookmarks are kept.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Keep' })).toHaveFocus()

    await user.click(within(dialog).getByRole('button', { name: 'Keep' }))
    expect(deleteCategory).not.toHaveBeenCalled()
    expect(within(dialog).getByRole('button', { name: 'Delete Reading' })).toHaveFocus()
  })

  it('deletes the category that is being filtered by, and clears that filter', async () => {
    renderAt('/?categoryId=1')
    const user = userEvent.setup()
    await screen.findByRole('link', { name: /React docs/ })
    const dialog = await openManageCategories(user)

    await user.click(within(dialog).getByRole('button', { name: 'Delete Dev' }))
    await user.click(within(dialog).getByRole('button', { name: 'Delete category' }))

    expect(deleteCategory).toHaveBeenCalledWith(1)
    await waitFor(() => expect(screen.getByTestId('address')).toHaveTextContent(/^\/$/))
    await waitFor(() => expect(filterOptions()).toEqual(['All categories', 'Reading']))
    // The bookmark is kept, just without the category.
    expect(screen.getByRole('link', { name: /React docs/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Show bookmarks in Dev' })).not.toBeInTheDocument()
  })
})

describe('adding a category from the bookmark form', () => {
  it('creates it, ticks it, and saves the bookmark with it', async () => {
    categories = []
    renderAt()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Add bookmark' }))
    const dialog = screen.getByRole('dialog', { name: 'Add bookmark' })
    expect(await within(dialog).findByText('No categories yet. Add one below.')).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('Address'), 'https://example.com')
    await user.type(within(dialog).getByLabelText('Title'), 'Example')
    // Enter in this field adds the category; it must not save the bookmark.
    await user.type(within(dialog).getByLabelText('New category'), 'Later{Enter}')

    expect(await within(dialog).findByRole('checkbox', { name: 'Later' })).toBeChecked()
    expect(createBookmark).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Save bookmark' }))
    expect(createBookmark).toHaveBeenCalledWith(expect.objectContaining({ categoryIds: [100] }))
  })
})

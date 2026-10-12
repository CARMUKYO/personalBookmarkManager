import { describe, expect, it } from 'vitest'
import { readFilters, withFilters, withPage } from './bookmarkFilters'

const params = (query: string) => new URLSearchParams(query)

describe('readFilters', () => {
  it('reads every filter from the address', () => {
    expect(readFilters(params('q=css&categoryId=3&sort=title&page=2'))).toEqual({
      page: 2,
      q: 'css',
      categoryId: 3,
      sort: 'title',
    })
  })

  it('uses the defaults when nothing is set', () => {
    expect(readFilters(params(''))).toEqual({ page: 1, q: '', categoryId: undefined, sort: 'newest' })
  })

  it('ignores invalid values instead of failing', () => {
    expect(readFilters(params('page=abc&categoryId=-4&sort=random&q=%20%20'))).toEqual({
      page: 1,
      q: '',
      categoryId: undefined,
      sort: 'newest',
    })
  })
})

describe('withFilters', () => {
  it('goes back to page 1 when a filter changes', () => {
    expect(withFilters(params('page=3&q=css'), { sort: 'title' }).toString()).toBe('q=css&sort=title')
  })

  it('leaves out defaults and empty values', () => {
    expect(withFilters(params('q=css&categoryId=3&sort=title'), { q: '  ', categoryId: undefined, sort: 'newest' }).toString()).toBe('')
  })

  it('keeps filters that were not changed', () => {
    expect(withFilters(params('q=css&sort=oldest'), { categoryId: 2 }).toString()).toBe('q=css&sort=oldest&categoryId=2')
  })
})

describe('withPage', () => {
  it('changes only the page, and leaves out page 1', () => {
    expect(withPage(params('q=css'), 2).toString()).toBe('q=css&page=2')
    expect(withPage(params('q=css&page=2'), 1).toString()).toBe('q=css')
  })
})

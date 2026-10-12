import { describe, expect, it } from 'vitest'
import { displayHost, savedLabel } from './format'

describe('displayHost', () => {
  it('shows the hostname without "www."', () => {
    expect(displayHost('https://www.seriouseats.com/roast-potatoes')).toBe('seriouseats.com')
    expect(displayHost('https://developer.mozilla.org/en-US/')).toBe('developer.mozilla.org')
  })

  it('returns the text unchanged if it is not an address', () => {
    expect(displayHost('not a url')).toBe('not a url')
  })
})

describe('savedLabel', () => {
  const now = new Date('2026-10-12T12:00:00')

  it('leaves out the year for dates in the current year', () => {
    expect(savedLabel('2026-10-03T09:00:00', now)).toBe('Saved 3 Oct')
  })

  it('includes the year for older dates', () => {
    expect(savedLabel('2024-01-15T09:00:00', now)).toBe('Saved 15 Jan 2024')
  })
})

import { describe, expect, it } from 'vitest'
import { mainDomain, tileFor } from './tile'

describe('mainDomain', () => {
  it('drops subdomains and the ending', () => {
    expect(mainDomain('react.dev')).toBe('react')
    expect(mainDomain('www.seriouseats.com')).toBe('seriouseats')
    expect(mainDomain('developer.mozilla.org')).toBe('mozilla')
    expect(mainDomain('news.ycombinator.com')).toBe('ycombinator')
  })

  it('handles two-part country endings', () => {
    expect(mainDomain('www.bbc.co.uk')).toBe('bbc')
    expect(mainDomain('abc.net.au')).toBe('abc')
  })

  it('keeps IP addresses and single names whole', () => {
    expect(mainDomain('127.0.0.1')).toBe('127.0.0.1')
    expect(mainDomain('localhost')).toBe('localhost')
  })
})

describe('tileFor', () => {
  it('uses the first letter of the site name', () => {
    expect(tileFor('https://developer.mozilla.org/en-US/docs/Web/CSS').letter).toBe('M')
    expect(tileFor('https://react.dev/').letter).toBe('R')
  })

  it('gives every page of one site the same tile', () => {
    const a = tileFor('https://developer.mozilla.org/a')
    const b = tileFor('http://www.mozilla.org/b?x=1')
    expect(a).toEqual(b)
  })

  it('picks a hue from 1 to 6', () => {
    for (const url of ['https://react.dev', 'https://css-tricks.com', 'https://lonelyplanet.com', 'http://localhost:3000']) {
      const { hue } = tileFor(url)
      expect(hue).toBeGreaterThanOrEqual(1)
      expect(hue).toBeLessThanOrEqual(6)
    }
  })

  it('spreads different sites over several hues', () => {
    // The first eight sites of the seed data. Before the hash was improved, four of these shared one colour.
    const sites = [
      'news.ycombinator.com', 'seriouseats.com', 'newsletter.pragmaticengineer.com', 'en.wikipedia.org',
      'smashingmagazine.com', 'bbc.com', 'gutenberg.org', 'lonelyplanet.com',
    ]
    const hues = sites.map((site) => tileFor(`https://${site}`).hue)
    expect(new Set(hues).size).toBeGreaterThanOrEqual(5)
    for (const hue of new Set(hues)) expect(hues.filter((h) => h === hue).length).toBeLessThanOrEqual(2)
  })

  it('falls back to a grey "?" tile for text that is not an address', () => {
    expect(tileFor('not a url')).toEqual({ letter: '?', hue: 0 })
    expect(tileFor('')).toEqual({ letter: '?', hue: 0 })
  })
})

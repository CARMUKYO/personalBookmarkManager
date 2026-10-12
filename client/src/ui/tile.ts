// The coloured letter tile shown next to each bookmark (see docs/design/design-plan.md).
// It is built from the address alone, so the app never has to load favicons from other sites.

export type Tile = {
  letter: string // one upper-case character, or '?' when the address can't be read
  hue: number // 1 to 6 picks one of the six tile colours in index.css; 0 is the grey fallback
}

const FALLBACK: Tile = { letter: '?', hue: 0 }
const HUE_COUNT = 6

export function tileFor(url: string): Tile {
  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return FALLBACK
  }

  const domain = mainDomain(hostname)
  if (!domain) return FALLBACK

  return { letter: domain[0].toUpperCase(), hue: (mix(fnv1a(domain)) % HUE_COUNT) + 1 }
}

// The part of the hostname that names the site, so every page of one site gets the same tile:
//   developer.mozilla.org -> mozilla   news.ycombinator.com -> ycombinator   bbc.co.uk -> bbc
// This is a simple rule, not a full list of domain endings, so a few unusual addresses get a less obvious letter.
export function mainDomain(hostname: string): string {
  const labels = hostname.toLowerCase().split('.').filter(Boolean)

  // An IP address (127.0.0.1) or a single name (localhost) has no "site" part: use it as it is.
  if (labels.length < 2 || labels.every((label) => /^\d+$/.test(label))) return labels.join('.')

  const last = labels[labels.length - 1]
  const secondLast = labels[labels.length - 2]
  // Country endings like .co.uk or .com.au: two short parts at the end, so the site name is one further left.
  if (labels.length >= 3 && last.length === 2 && secondLast.length <= 3) return labels[labels.length - 3]

  return secondLast
}

// FNV-1a: a small, well-spread string hash. The same text always gives the same number.
function fnv1a(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash
}

// FNV-1a's lowest bits barely change between similar names, and "% 6" depends on them, so on real data
// four of eight sites came out coral. This step (the "finaliser" from the MurmurHash3 hash) stirs every bit
// into the low ones, so the six colours are used evenly.
function mix(hash: number): number {
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b) >>> 0
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0
  hash ^= hash >>> 16
  return hash >>> 0
}

// Small helpers that turn raw API values into the text shown on screen.

// "https://www.example.com/a/b" -> "example.com". Falls back to the raw text if it isn't a valid address.
export function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// "Saved 3 Oct" for this year, "Saved 3 Oct 2024" for earlier years.
// en-GB is fixed on purpose: the rest of the interface is in English, and it keeps the day before the month.
export function savedLabel(isoDate: string, now: Date = new Date()): string {
  const date = new Date(isoDate)
  const sameYear = date.getFullYear() === now.getFullYear()
  const text = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  })
  return `Saved ${text}`
}

// A circled "!" shown next to error text, so an error is never shown by colour alone.
export function ErrorIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="10" cy="10" r="8.5" />
      <path d="M10 5.5v5.5M10 14v.2" />
    </svg>
  )
}

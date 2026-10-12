import { useEffect, useState } from 'react'

// Returns `value`, but only after it has stopped changing for `delay` milliseconds.
// Used for the search box: typing "react" sends one search, not five ("r", "re", "rea"...).
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    // A new key press clears the old timer before it fires, so only the last value survives.
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

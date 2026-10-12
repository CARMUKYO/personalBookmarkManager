import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Remove rendered components and fake fetches between tests so they cannot affect each other.
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

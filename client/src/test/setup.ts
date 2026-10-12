import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Remove rendered components and fake fetches between tests so they cannot affect each other.
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// jsdom (the fake browser) knows <dialog> but not its showModal() and close() methods yet.
// These stand-ins only open and close it; real browsers also trap focus and dim the page.
// Pressing Escape is simulated in tests by firing a 'cancel' event, which is what browsers do.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return
    this.open = false
    // Like real browsers, the 'close' event arrives a moment later, not during the close() call.
    setTimeout(() => this.dispatchEvent(new Event('close')), 0)
  }
}

import { render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('Modal', () => {
  it('stays open in StrictMode, where React opens, closes and reopens it on purpose', async () => {
    const onClose = vi.fn()
    render(
      <StrictMode>
        <Modal labelledBy="t" onCancel={() => {}} onClose={onClose}>
          <h2 id="t">Hello</h2>
        </Modal>
      </StrictMode>,
    )

    await wait(10) // let the late 'close' event from the first (StrictMode) close arrive

    expect(screen.getByRole('dialog', { name: 'Hello' })).toHaveAttribute('open')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('reports when the browser closes the dialog by itself', async () => {
    const onClose = vi.fn()
    render(
      <Modal labelledBy="t" onCancel={() => {}} onClose={onClose}>
        <h2 id="t">Hello</h2>
      </Modal>,
    )

    ;(screen.getByRole('dialog') as HTMLDialogElement).close()
    await wait(10)

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

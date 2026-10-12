import { useEffect, useEffectEvent, useRef, type ReactNode, type SyntheticEvent } from 'react'

type ModalProps = {
  labelledBy: string // id of the dialog's heading, read out when it opens
  describedBy?: string
  // The user pressed Escape. The browser would close the dialog right away; we stop that and let you decide
  // (e.g. ask before throwing away unsaved changes). To close, stop rendering the Modal.
  onCancel: () => void
  // The browser closed the dialog on its own (some browsers do on a second Escape). Stop rendering the Modal.
  onClose: () => void
  children: ReactNode
}

// A native <dialog> opened as a modal: the browser dims the page, keeps keyboard focus inside the dialog,
// and puts focus back on the button that opened it when it closes. Render it to open it; remove it to close it.
export function Modal({ labelledBy, describedBy, onCancel, onClose, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)

  // An "effect event": the effect below can call it, and it always uses the latest onClose prop,
  // without onClose being a dependency (which would close and reopen the dialog whenever the parent re-renders).
  const handleBrowserClose = useEffectEvent(() => onClose())

  // Open when this component appears, close when it goes away.
  useEffect(() => {
    const dialog = ref.current!
    // The browser delivers 'close' a moment after the dialog closes. If it's open again by then, the event is
    // stale: in development React mounts components twice (open, close, open) to catch bugs, and the first
    // close arrives after the second open. Only a dialog that is still closed was really closed by the browser.
    const listener = () => {
      if (!dialog.open) handleBrowserClose()
    }
    dialog.addEventListener('close', listener)
    dialog.showModal()
    return () => {
      // Stop listening first: closing it ourselves here is not "the browser closed it".
      dialog.removeEventListener('close', listener)
      dialog.close()
    }
  }, [])

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault()
    onCancel()
  }

  return (
    <dialog ref={ref} aria-labelledby={labelledBy} aria-describedby={describedBy} onCancel={handleCancel}>
      {children}
    </dialog>
  )
}

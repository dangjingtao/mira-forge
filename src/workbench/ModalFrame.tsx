import { useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

type ModalFrameProps = {
  className: string
  labelledBy: string
  children: ReactNode
  onClose: () => void
  shortcuts?: Record<string, () => void>
}

const focusableSelector = [
  'button:not(:disabled)',
  'a[href]',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export default function ModalFrame({ className, labelledBy, children, onClose, shortcuts = {} }: ModalFrameProps) {
  const dialogRef = useRef<HTMLElement>(null)

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    event.stopPropagation()

    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }

    if (event.key === 'Tab') {
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector)
      if (!focusable?.length) {
        event.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
      return
    }

    const target = event.target as HTMLElement
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
    const shortcut = shortcuts[event.key.toLowerCase()]
    if (shortcut) {
      event.preventDefault()
      shortcut()
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
      onKeyDown={onKeyDown}
    >
      <section ref={dialogRef} className={className} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </section>
    </div>
  )
}

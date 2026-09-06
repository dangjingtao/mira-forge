import { useEffect, useRef, useState } from 'react'

function ShortcutFeedback() {
  const [message, setMessage] = useState('')
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    function show(message: string) {
      setMessage(message)
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setMessage(''), 1800)
    }

    async function verifyRefresh() {
      try {
        const response = await fetch('/api/state')
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        show('refresh ok')
      } catch (cause) {
        show(`refresh failed · ${cause instanceof Error ? cause.message : String(cause)}`)
      }
    }

    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (document.querySelector('.modal-backdrop')) return

      if (event.key === 'r') {
        void verifyRefresh()
        return
      }

      if (['j', 'k', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
        const count = document.querySelectorAll('.project-item').length
        if (count <= 1) show(count === 1 ? '1 workspace · navigation unchanged' : '0 workspaces · navigation unchanged')
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [])

  if (!message) return null
  return <div className="shortcut-feedback" role="status" aria-live="polite">{message}</div>
}

export default ShortcutFeedback

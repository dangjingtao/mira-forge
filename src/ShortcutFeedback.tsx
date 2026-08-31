import { useEffect, useRef, useState } from 'react'

const feedbackStyle = {
  position: 'fixed' as const,
  right: 18,
  bottom: 56,
  zIndex: 9,
  padding: '7px 10px',
  border: '1px solid #28313d',
  background: '#11161d',
  color: '#a3d977',
  fontFamily: '"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace',
  fontSize: 10,
  letterSpacing: '.04em',
  pointerEvents: 'none' as const,
}

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
  return <div role="status" aria-live="polite" style={feedbackStyle}>{message}</div>
}

export default ShortcutFeedback

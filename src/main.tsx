import { StrictMode, useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import MainThreadPanel from './MainThreadPanel'
import ShortcutFeedback from './ShortcutFeedback'
import './styles.css'
import './t016-builder-ui.css'
import './visual-restraint.css'

const RAIL_WIDTH_KEY = 'mira-forge:main-thread-width'
const DEFAULT_RAIL_WIDTH = 370
const MIN_RAIL_WIDTH = 320
const MAX_RAIL_WIDTH = 720
const MIN_CONTROL_WIDTH = 640

function clampRailWidth(width: number, shellWidth: number) {
  const viewportMax = Math.max(MIN_RAIL_WIDTH, shellWidth - MIN_CONTROL_WIDTH)
  return Math.round(Math.min(Math.max(width, MIN_RAIL_WIDTH), Math.min(MAX_RAIL_WIDTH, viewportMax)))
}

function readRailWidth() {
  try {
    const stored = Number(window.localStorage.getItem(RAIL_WIDTH_KEY))
    return Number.isFinite(stored) ? Math.min(Math.max(stored, MIN_RAIL_WIDTH), MAX_RAIL_WIDTH) : DEFAULT_RAIL_WIDTH
  } catch {
    return DEFAULT_RAIL_WIDTH
  }
}

function ForgeShell() {
  const shellRef = useRef<HTMLDivElement>(null)
  const [railWidth, setRailWidth] = useState(readRailWidth)
  const [resizing, setResizing] = useState(false)

  useEffect(() => {
    try {
      window.localStorage.setItem(RAIL_WIDTH_KEY, String(railWidth))
    } catch {
      // Local UI preference persistence is best effort only.
    }
  }, [railWidth])

  useEffect(() => {
    function onResize() {
      const shell = shellRef.current
      if (!shell || !window.matchMedia('(min-width: 1181px)').matches) return
      setRailWidth((current) => clampRailWidth(current, shell.clientWidth))
    }

    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    document.body.classList.toggle('forge-resizing-thread', resizing)
    return () => document.body.classList.remove('forge-resizing-thread')
  }, [resizing])

  function resizeTo(clientX: number) {
    const shell = shellRef.current
    if (!shell || !window.matchMedia('(min-width: 1181px)').matches) return
    const rect = shell.getBoundingClientRect()
    setRailWidth(clampRailWidth(rect.right - clientX, rect.width))
  }

  function onResizeStart(event: PointerEvent<HTMLDivElement>) {
    if (!window.matchMedia('(min-width: 1181px)').matches) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setResizing(true)
    resizeTo(event.clientX)
  }

  function onResizeMove(event: PointerEvent<HTMLDivElement>) {
    if (!resizing) return
    resizeTo(event.clientX)
  }

  function onResizeEnd(event: PointerEvent<HTMLDivElement>) {
    if (!resizing) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setResizing(false)
  }

  function onResizeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const shell = shellRef.current
    if (!shell || !window.matchMedia('(min-width: 1181px)').matches) return

    let next: number | null = null
    if (event.key === 'ArrowLeft') next = railWidth + 24
    if (event.key === 'ArrowRight') next = railWidth - 24
    if (event.key === 'Home') next = MIN_RAIL_WIDTH
    if (event.key === 'End') next = MAX_RAIL_WIDTH
    if (next === null) return

    event.preventDefault()
    setRailWidth(clampRailWidth(next, shell.clientWidth))
  }

  return (
    <div
      ref={shellRef}
      className="forge-product-shell"
      style={{ '--forge-thread-width': `${railWidth}px` } as CSSProperties}
    >
      <App />
      <aside className="forge-thread-rail" aria-label="Main thread workspace">
        <div
          className="forge-thread-resizer"
          role="separator"
          aria-label="Resize main thread"
          aria-orientation="vertical"
          aria-valuemin={MIN_RAIL_WIDTH}
          aria-valuemax={MAX_RAIL_WIDTH}
          aria-valuenow={railWidth}
          tabIndex={0}
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          onPointerCancel={onResizeEnd}
          onKeyDown={onResizeKeyDown}
        />
        <MainThreadPanel />
      </aside>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <>
      <ForgeShell />
      <ShortcutFeedback />
    </>
  </StrictMode>,
)

import { useEffect, useMemo, useState } from 'react'
import { buildLiveRuntimeRows } from './live-runtime-model.js'
import type { Batch, Dispatch, MainThread, Review, RuntimeEvent, Session } from './model'
import RuntimeEventLogModal from './RuntimeEventLogModal'
import RuntimeInspectorModal from './RuntimeInspectorModal'

type RuntimeControlProps = {
  projectId: string
  batches: Batch[]
  dispatches: Dispatch[]
  sessions: Session[]
  reviews: Review[]
  threads: MainThread[]
  events: RuntimeEvent[]
  onSelectTask: (key: string) => void
  onOpenMainThread: (projectId: string, threadId: string) => void
}

type OpenSurface = 'runtime' | 'events' | null

export default function RuntimeControl({
  projectId,
  batches,
  dispatches,
  sessions,
  reviews,
  threads,
  events,
  onSelectTask,
  onOpenMainThread,
}: RuntimeControlProps) {
  const [openSurface, setOpenSurface] = useState<OpenSurface>(null)
  const rows = useMemo(() => buildLiveRuntimeRows({
    projectId,
    batches,
    dispatches,
    sessions,
    reviews,
    threads,
  }), [batches, dispatches, projectId, reviews, sessions, threads])
  const activeCount = rows.filter((row) => row.active).length
  const attentionCount = rows.filter((row) => row.attention).length

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!openSurface) return
      const target = event.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpenSurface(null)
      } else if (event.key.toLowerCase() === 'e') {
        event.preventDefault()
        setOpenSurface('events')
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openSurface])

  return (
    <>
      <button
        className={`runtime-summary ${attentionCount ? 'has-attention' : ''}`}
        type="button"
        onClick={() => setOpenSurface('runtime')}
        aria-haspopup="dialog"
      >
        <span className="runtime-summary-label">RUNTIME</span>
        <span className="runtime-summary-status">
          <b>{activeCount}</b> active
          <i>·</i>
          <b>{attentionCount}</b> attention
          <i>·</i>
          <span>{events.length} events</span>
        </span>
        <span className="runtime-summary-action">inspect <kbd>↵</kbd></span>
      </button>

      {openSurface === 'runtime' && (
        <RuntimeInspectorModal
          rows={rows}
          batches={batches}
          onClose={() => setOpenSurface(null)}
          onOpenEvents={() => setOpenSurface('events')}
          onSelectTask={onSelectTask}
          onOpenMainThread={(nextProjectId, threadId) => {
            onOpenMainThread(nextProjectId, threadId)
            setOpenSurface(null)
          }}
        />
      )}

      {openSurface === 'events' && (
        <RuntimeEventLogModal
          events={events}
          onClose={() => setOpenSurface(null)}
          onBack={() => setOpenSurface('runtime')}
        />
      )}
    </>
  )
}

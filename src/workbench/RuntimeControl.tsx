import { useMemo, useRef, useState } from 'react'
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
  const summaryRef = useRef<HTMLButtonElement>(null)
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

  function closeSurface() {
    setOpenSurface(null)
    window.setTimeout(() => summaryRef.current?.focus(), 0)
  }

  return (
    <>
      <button
        ref={summaryRef}
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
          onClose={closeSurface}
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
          onClose={closeSurface}
          onBack={() => setOpenSurface('runtime')}
        />
      )}
    </>
  )
}

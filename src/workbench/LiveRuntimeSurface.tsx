import { useEffect, useMemo, useState } from 'react'
import { buildLiveRuntimeRows, formatRuntimeDuration } from './live-runtime-model.js'
import type { LiveRuntimeRow } from './live-runtime-model.js'
import type { Batch, Dispatch, MainThread, Review, Session } from './model'
import { formatTime, taskKey } from './model'

type LiveRuntimeSurfaceProps = {
  projectId?: string
  batches: Batch[]
  dispatches: Dispatch[]
  sessions: Session[]
  reviews: Review[]
  threads: MainThread[]
  onSelectTask: (key: string) => void
  onOpenMainThread: (projectId: string, threadId: string) => void
}

function runtimeTone(row: LiveRuntimeRow) {
  if (['blocked', 'failed', 'cancelled', 'interrupted', 'error', 'changes_requested'].includes(row.status)) return 'danger'
  if (['running', 'starting', 'waiting', 'review_needed', 'reviewing'].includes(row.status)) return 'warning'
  if (['completed', 'passed', 'review_passed', 'integrated'].includes(row.status)) return 'success'
  return 'info'
}

function runtimeKindLabel(row: LiveRuntimeRow) {
  if (row.kind === 'main') return 'MAIN'
  if (row.kind === 'builder') return 'BUILD'
  if (row.kind === 'reviewer') return 'REVIEW'
  return row.status === 'blocked' ? 'BLOCK' : 'ACTION'
}

function runtimeTimeLabel(row: LiveRuntimeRow, now: number) {
  if (row.kind === 'main') return `updated ${formatTime(row.updatedAt)}`
  if (!row.startedAt) return row.updatedAt ? `updated ${formatTime(row.updatedAt)}` : 'pending'
  return `${formatTime(row.startedAt)} · ${formatRuntimeDuration(row.startedAt, row.endedAt, now)}`
}

export default function LiveRuntimeSurface({
  projectId,
  batches,
  dispatches,
  sessions,
  reviews,
  threads,
  onSelectTask,
  onOpenMainThread,
}: LiveRuntimeSurfaceProps) {
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const rows = useMemo(() => buildLiveRuntimeRows({
    projectId,
    batches,
    dispatches,
    sessions,
    reviews,
    threads,
  }), [batches, dispatches, projectId, reviews, sessions, threads])
  const selectedRow = rows.find((row) => row.id === selectedRowId) ?? null

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (selectedRowId && !rows.some((row) => row.id === selectedRowId)) setSelectedRowId(null)
  }, [rows, selectedRowId])

  if (!rows.length) return null

  function openRow(row: LiveRuntimeRow) {
    setSelectedRowId((current) => current === row.id ? null : row.id)
    if (row.kind === 'main' && row.threadId) {
      onOpenMainThread(row.projectId, row.threadId)
      return
    }
    if (row.batchId && row.taskId) onSelectTask(taskKey(row.batchId, row.taskId))
  }

  return (
    <section className="live-runtime" aria-label="live runtime sessions">
      <div className="live-runtime-head">
        <strong>LIVE RUNTIME</strong>
        <span>{rows.filter((row) => row.active).length} active · {rows.filter((row) => row.attention).length} attention</span>
      </div>
      <div className="live-runtime-list">
        {rows.map((row) => (
          <div className={`live-runtime-item tone-${runtimeTone(row)} ${row.id === selectedRowId ? 'selected' : ''}`} key={row.id}>
            <button className="live-runtime-row" type="button" onClick={() => openRow(row)} aria-expanded={row.id === selectedRowId}>
              <span className="live-runtime-kind">{runtimeKindLabel(row)}</span>
              <span className="live-runtime-copy">
                <strong>{row.taskId ? `${row.taskId} · ${row.title}` : row.title}</strong>
                <small>{row.provider ? `${row.provider} · ` : ''}{row.detail}</small>
              </span>
              <span className="live-runtime-time">{runtimeTimeLabel(row, now)}</span>
              <span className="live-runtime-states">
                <b className={`runtime-state state-${row.status}`}>{row.status.replaceAll('_', ' ')}</b>
                {row.taskStatus && row.taskStatus !== row.status && (
                  <b className={`runtime-state state-${row.taskStatus}`}>task {row.taskStatus.replaceAll('_', ' ')}</b>
                )}
              </span>
            </button>
            {row.threadId && row.kind !== 'main' && (
              <button
                className="live-runtime-thread-link"
                type="button"
                onClick={() => onOpenMainThread(row.projectId, row.threadId!)}
                title="Open linked Main Thread"
              >main ↗</button>
            )}
          </div>
        ))}
      </div>

      {selectedRow && selectedRow.kind !== 'main' && (
        <div className="live-runtime-detail">
          <div className="live-runtime-detail-head">
            <strong>{selectedRow.kind === 'task' ? 'STATE DETAIL' : 'SESSION DETAIL'}</strong>
            <button type="button" onClick={() => setSelectedRowId(null)} aria-label="Close runtime detail">×</button>
          </div>
          <div className="live-runtime-detail-grid">
            {selectedRow.sessionId && <span><b>session</b><code>{selectedRow.sessionId}</code></span>}
            {selectedRow.externalSessionId && <span><b>provider</b><code>{selectedRow.externalSessionId}</code></span>}
            {selectedRow.batchId && <span><b>batch</b><code>{selectedRow.batchId}</code></span>}
            {selectedRow.taskId && <span><b>task</b><code>{selectedRow.taskId}</code></span>}
          </div>
          {selectedRow.error && <p className="live-runtime-error">{selectedRow.error}</p>}
          {selectedRow.resultText && <pre className="live-runtime-result">{selectedRow.resultText}</pre>}
          {!selectedRow.error && !selectedRow.resultText && <p className="live-runtime-detail-note">{selectedRow.detail}</p>}
        </div>
      )}
    </section>
  )
}

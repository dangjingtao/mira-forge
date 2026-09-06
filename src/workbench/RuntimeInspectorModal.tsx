import { useEffect, useMemo, useState } from 'react'
import { formatRuntimeDuration } from './live-runtime-model.js'
import type { LiveRuntimeRow } from './live-runtime-model.js'
import type { Batch } from './model'
import { formatTime, taskKey } from './model'
import ModalFrame from './ModalFrame'
import RuntimeRowDetail from './RuntimeRowDetail'

type RuntimeInspectorModalProps = {
  rows: LiveRuntimeRow[]
  batches: Batch[]
  onClose: () => void
  onOpenEvents: () => void
  onSelectTask: (key: string) => void
  onOpenMainThread: (projectId: string, threadId: string) => void
}

function rowTone(row: LiveRuntimeRow) {
  if (['blocked', 'failed', 'cancelled', 'interrupted', 'error', 'changes_requested'].includes(row.status)) return 'danger'
  if (['running', 'starting', 'waiting', 'review_needed', 'reviewing'].includes(row.status)) return 'warning'
  if (['completed', 'passed', 'review_passed', 'integrated'].includes(row.status)) return 'success'
  return 'info'
}

function rowKind(row: LiveRuntimeRow) {
  if (row.kind === 'builder') return 'BUILD'
  if (row.kind === 'reviewer') return 'REVIEW'
  if (row.kind === 'task') return row.status === 'blocked' ? 'BLOCK' : 'ACTION'
  return 'MAIN'
}

function timeLabel(row: LiveRuntimeRow, now: number) {
  if (row.kind === 'main') return `updated ${formatTime(row.updatedAt)}`
  if (!row.startedAt) return row.updatedAt ? `updated ${formatTime(row.updatedAt)}` : 'pending'
  return `${formatTime(row.startedAt)} · ${formatRuntimeDuration(row.startedAt, row.endedAt, now)}`
}

export default function RuntimeInspectorModal({
  rows,
  batches,
  onClose,
  onOpenEvents,
  onSelectTask,
  onOpenMainThread,
}: RuntimeInspectorModalProps) {
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const workRows = useMemo(() => rows.filter((row) => row.kind !== 'main'), [rows])
  const mainRows = useMemo(() => rows.filter((row) => row.kind === 'main'), [rows])
  const selectedRow = rows.find((row) => row.id === selectedRowId) ?? null

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (selectedRowId && !rows.some((row) => row.id === selectedRowId)) setSelectedRowId(null)
  }, [rows, selectedRowId])

  function openWorkRow(row: LiveRuntimeRow) {
    setSelectedRowId(row.id)
    if (row.batchId && row.taskId) onSelectTask(taskKey(row.batchId, row.taskId))
  }

  function relationLabel(row: LiveRuntimeRow) {
    if (row.kind === 'main') return row.provider ? `${row.provider} · ${row.detail}` : row.detail
    const batch = row.batchId ? batches.find((item) => item.id === row.batchId) : null
    const relation = batch && row.taskId ? `${batch.name} / ${row.taskId}` : row.taskId ?? row.batchId ?? 'project runtime'
    return row.provider ? `${relation} · ${row.provider}` : relation
  }

  return (
    <ModalFrame
      className="runtime-inspector-modal"
      labelledBy="runtime-inspector-title"
      onClose={onClose}
      shortcuts={{ e: onOpenEvents }}
    >
      <header className="runtime-inspector-head">
        <div>
          <strong id="runtime-inspector-title">RUNTIME INSPECTOR</strong>
          <span>{rows.filter((row) => row.active).length} active · {rows.filter((row) => row.attention).length} attention</span>
        </div>
        <div className="runtime-inspector-actions">
          <button type="button" onClick={onOpenEvents}><kbd>e</kbd> events</button>
          <button type="button" onClick={onClose} autoFocus={!rows.length}><kbd>esc</kbd> close</button>
        </div>
      </header>

      <div className="runtime-inspector-body">
        <section className="runtime-inspector-section" aria-labelledby="runtime-work-title">
          <div className="runtime-inspector-section-title" id="runtime-work-title">BUILDER / REVIEW <span>{workRows.length}</span></div>
          {workRows.length ? (
            <div className="runtime-inspector-list">
              {workRows.map((row, index) => (
                <button
                  className={`runtime-inspector-row tone-${rowTone(row)} ${row.id === selectedRowId ? 'selected' : ''}`}
                  type="button"
                  key={row.id}
                  onClick={() => openWorkRow(row)}
                  autoFocus={index === 0}
                >
                  <span className="runtime-inspector-kind">{rowKind(row)}</span>
                  <span className="runtime-inspector-copy">
                    <strong>{row.taskId ? `${row.taskId} · ${row.title}` : row.title}</strong>
                    <small>{relationLabel(row)}</small>
                  </span>
                  <span className="runtime-inspector-time">{timeLabel(row, now)}</span>
                  <span className="runtime-inspector-states">
                    <b className={`runtime-state state-${row.status}`}>{row.status.replaceAll('_', ' ')}</b>
                    {row.taskStatus && row.taskStatus !== row.status && (
                      <b className={`runtime-state state-${row.taskStatus}`}>task {row.taskStatus.replaceAll('_', ' ')}</b>
                    )}
                  </span>
                </button>
              ))}
            </div>
          ) : <p className="runtime-inspector-empty">No Builder or review runtime for this project.</p>}
        </section>

        <section className="runtime-inspector-section" aria-labelledby="runtime-main-title">
          <div className="runtime-inspector-section-title" id="runtime-main-title">MAIN THREADS <span>{mainRows.length}</span></div>
          {mainRows.length ? (
            <div className="runtime-inspector-list">
              {mainRows.map((row, index) => (
                <button
                  className={`runtime-inspector-row tone-${rowTone(row)}`}
                  type="button"
                  key={row.id}
                  onClick={() => row.threadId && onOpenMainThread(row.projectId, row.threadId)}
                  autoFocus={!workRows.length && index === 0}
                >
                  <span className="runtime-inspector-kind">MAIN</span>
                  <span className="runtime-inspector-copy">
                    <strong>{row.title}</strong>
                    <small>{relationLabel(row)}</small>
                  </span>
                  <span className="runtime-inspector-time">{timeLabel(row, now)}</span>
                  <span className="runtime-inspector-states">
                    <b className={`runtime-state state-${row.status}`}>{row.status.replaceAll('_', ' ')}</b>
                  </span>
                </button>
              ))}
            </div>
          ) : <p className="runtime-inspector-empty">No Main Thread runtime for this project.</p>}
        </section>

        {selectedRow && selectedRow.kind !== 'main' && (
          <RuntimeRowDetail
            row={selectedRow}
            onOpenMainThread={selectedRow.threadId ? () => onOpenMainThread(selectedRow.projectId, selectedRow.threadId!) : undefined}
          />
        )}
      </div>
    </ModalFrame>
  )
}

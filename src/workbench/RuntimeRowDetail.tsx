import type { LiveRuntimeRow } from './live-runtime-model.js'

type RuntimeRowDetailProps = {
  row: LiveRuntimeRow
  onOpenMainThread?: () => void
}

export default function RuntimeRowDetail({ row, onOpenMainThread }: RuntimeRowDetailProps) {
  return (
    <section className="runtime-row-detail" aria-label="selected runtime detail">
      <header>
        <div>
          <strong>{row.kind === 'task' ? 'STATE DETAIL' : 'SESSION DETAIL'}</strong>
          <span>{row.taskId ?? row.title}</span>
        </div>
        {onOpenMainThread && <button type="button" onClick={onOpenMainThread}>open main thread ↗</button>}
      </header>
      <div className="runtime-row-detail-grid">
        {row.sessionId && <span><b>session</b><code>{row.sessionId}</code></span>}
        {row.externalSessionId && <span><b>provider</b><code>{row.externalSessionId}</code></span>}
        {row.batchId && <span><b>batch</b><code>{row.batchId}</code></span>}
        {row.taskId && <span><b>task</b><code>{row.taskId}</code></span>}
      </div>
      {row.error && <p className="runtime-row-error">{row.error}</p>}
      {row.resultText && <pre className="runtime-row-result">{row.resultText}</pre>}
      {!row.error && !row.resultText && <p className="runtime-row-note">{row.detail}</p>}
    </section>
  )
}

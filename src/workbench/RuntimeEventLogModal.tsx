import type { RuntimeEvent } from './model'
import RuntimeEventLog from './RuntimeEventLog'

type RuntimeEventLogModalProps = {
  events: RuntimeEvent[]
  onClose: () => void
  onBack: () => void
}

export default function RuntimeEventLogModal({ events, onClose, onBack }: RuntimeEventLogModalProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="runtime-event-modal" role="dialog" aria-modal="true" aria-labelledby="runtime-event-title">
        <header className="runtime-inspector-head">
          <div>
            <strong id="runtime-event-title">EVENT LOG</strong>
            <span>{events.length} persisted project events</span>
          </div>
          <div className="runtime-inspector-actions">
            <button type="button" onClick={onBack}>← runtime</button>
            <button type="button" onClick={onClose} autoFocus><kbd>esc</kbd> close</button>
          </div>
        </header>
        <div className="runtime-event-modal-body">
          {events.length ? <RuntimeEventLog events={events} /> : <p className="runtime-inspector-empty">No runtime events for this project.</p>}
        </div>
      </section>
    </div>
  )
}

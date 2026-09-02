import BatchList from './BatchList'
import RuntimeEventLog from './RuntimeEventLog'
import type { Batch, Dispatch, Project, RuntimeEvent, WorkbenchStats } from './model'

type RuntimePaneProps = {
  selected?: Project
  actionError: string
  connectionError: string
  stats: WorkbenchStats
  batches: Batch[]
  dispatches: Dispatch[]
  selectedTaskKey: string | null
  selectedEvents: RuntimeEvent[]
  activeBuilderDispatch: Dispatch | null
  onRefresh: () => void
  onNewBatch: () => void
  onSelectTask: (key: string) => void
}

function Stat({ label, value }: { label: string; value: number }) {
  return <span className="stat"><b>{value}</b> {label}</span>
}

export default function RuntimePane({
  selected,
  actionError,
  connectionError,
  stats,
  batches,
  dispatches,
  selectedTaskKey,
  selectedEvents,
  activeBuilderDispatch,
  onRefresh,
  onNewBatch,
  onSelectTask,
}: RuntimePaneProps) {
  return (
    <section className="main-pane">
      <div className="pane-head">
        <div>
          <span className="eyebrow">PROJECT STATUS</span>
          <h1>{selected?.name ?? 'empty workspace'}</h1>
          <code>{selected?.rootPath ?? 'No project selected'}</code>
        </div>
        <button className="refresh" onClick={onRefresh} title="Refresh (r)">↻ <kbd>r</kbd></button>
      </div>

      {(actionError || connectionError) && (
        <div className="error-line" aria-live="polite">! {actionError || `control service: ${connectionError}`}</div>
      )}

      {selected ? (
        <>
          <div className="stat-line">
            <Stat label="tasks" value={stats.total} />
            <Stat label="building" value={stats.active} />
            <Stat label="reviewing" value={stats.reviewing} />
            <Stat label="passed" value={stats.passed} />
          </div>

          <div className="stream-label">
            <span className="stream-heading">RUNTIME STREAM</span>
            <div className="stream-right">
              <span className="stream-meta">
                {activeBuilderDispatch
                  ? `${activeBuilderDispatch.adapterId} busy · ${activeBuilderDispatch.taskId}`
                  : `${selectedEvents.length} events · ${batches.length} batches`}
              </span>
              <button className="stream-action" type="button" onClick={onNewBatch}>
                + batch <kbd>b</kbd>
              </button>
            </div>
          </div>

          <BatchList
            batches={batches}
            dispatches={dispatches}
            selectedTaskKey={selectedTaskKey}
            onSelectTask={onSelectTask}
            onNewBatch={onNewBatch}
          />
          <RuntimeEventLog events={selectedEvents} />
        </>
      ) : (
        <div className="empty-workspace">
          <span className="prompt">›</span>
          <div><strong>workspace is empty</strong><p>Press <kbd>n</kbd> to register a local project.</p></div>
        </div>
      )}

      <footer className="keybar">
        <span><kbd>j</kbd><kbd>k</kbd> navigate</span>
        <span><kbd>tab</kbd> select task</span>
        <span><kbd>b</kbd> new batch</span>
        <span><kbd>d</kbd> dispatch</span>
        <span><kbd>x</kbd> cancel</span>
        <span><kbd>n</kbd> new project</span>
        <span><kbd>/</kbd> commands</span>
        <span><kbd>r</kbd> refresh</span>
        <span><kbd>esc</kbd> close</span>
      </footer>
    </section>
  )
}

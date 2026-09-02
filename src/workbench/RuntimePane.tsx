import type { Batch, Dispatch, Project, RuntimeEvent, WorkbenchStats } from './model'
import { activeDispatchStatuses, formatEventData, formatTime, statusLabels, taskKey } from './model'

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

          {batches.length ? batches.map((batch) => (
            <article className="batch" key={batch.id}>
              <div className="batch-head"><strong>{batch.name}</strong><span>{batch.status}</span></div>
              {batch.tasks.map((task) => {
                const key = taskKey(batch.id, task.id)
                const taskDispatch = dispatches.find(
                  (dispatch) => dispatch.batchId === batch.id
                    && dispatch.taskId === task.id
                    && activeDispatchStatuses.has(dispatch.status),
                )
                return (
                  <button
                    type="button"
                    className={`task task-button ${key === selectedTaskKey ? 'selected-task' : ''}`}
                    key={task.id}
                    aria-pressed={key === selectedTaskKey}
                    onClick={() => onSelectTask(key)}
                    onFocus={() => onSelectTask(key)}
                  >
                    <span className={`status-dot dot-${task.status}`} />
                    <b>{task.id}</b>
                    <span className="task-title">{task.title}</span>
                    <span className="task-meta">
                      {taskDispatch ? `${taskDispatch.adapterId} · ${taskDispatch.status}` : task.builder || 'unassigned'}
                      {task.reviewRound ? ` · review #${task.reviewRound}` : ''}
                    </span>
                    <span className={`task-status status-${task.status}`}>{statusLabels[task.status] || task.status}</span>
                  </button>
                )
              })}
            </article>
          )) : (
            <div className="empty-stream">
              <span className="prompt">›</span>
              <div>
                <strong>no batches to dispatch</strong>
                <p>Create a Batch from repository Task Cards. Forge keeps the cards in the repository as the source of truth.</p>
                <button className="empty-action" type="button" onClick={onNewBatch}>
                  create batch from repo tasks <kbd>b</kbd>
                </button>
              </div>
            </div>
          )}

          {selectedEvents.length > 0 && (
            <div className="event-log" aria-label="runtime events">
              <div className="event-log-title">EVENT LOG <span>latest {Math.min(selectedEvents.length, 30)}</span></div>
              {[...selectedEvents].slice(-30).reverse().map((event) => (
                <div className={`runtime-event event-${event.type.split('.').at(-1)}`} key={event.id}>
                  <time>{formatTime(event.createdAt)}</time>
                  <span className="event-task">{event.taskId ?? '—'}</span>
                  <strong>{event.type}</strong>
                  <span className="event-detail">{formatEventData(event)}</span>
                </div>
              ))}
            </div>
          )}
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

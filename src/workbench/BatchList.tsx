import type { Batch, Dispatch } from './model'
import { activeDispatchStatuses, statusLabels, taskKey } from './model'

type BatchListProps = {
  batches: Batch[]
  dispatches: Dispatch[]
  selectedTaskKey: string | null
  onSelectTask: (key: string) => void
  onNewBatch: () => void
}

export default function BatchList({ batches, dispatches, selectedTaskKey, onSelectTask, onNewBatch }: BatchListProps) {
  if (!batches.length) {
    return (
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
    )
  }

  return batches.map((batch) => (
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
  ))
}

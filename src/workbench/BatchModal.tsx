import type { FormEventHandler } from 'react'
import type { Project, RepositoryTaskSource } from './model'

type BatchModalProps = {
  selected: Project
  loading: boolean
  source: RepositoryTaskSource | null
  sourceError: string
  selection: Set<string>
  existingRuntimeTaskIds: Set<string>
  batchSaving: boolean
  sourceSaving: boolean
  onToggleTask: (taskId: string) => void
  onCreateBatch: FormEventHandler<HTMLFormElement>
  onConfigureSource: FormEventHandler<HTMLFormElement>
  onClose: () => void
}

export default function BatchModal({
  selected,
  loading,
  source,
  sourceError,
  selection,
  existingRuntimeTaskIds,
  batchSaving,
  sourceSaving,
  onToggleTask,
  onCreateBatch,
  onConfigureSource,
  onClose,
}: BatchModalProps) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      {loading ? (
        <div className="action-modal batch-modal">
          <div className="modal-title">NEW BATCH <kbd>esc</kbd></div>
          <p className="modal-loading">loading repository task source...</p>
        </div>
      ) : source ? (
        <form className="action-modal batch-modal" onSubmit={onCreateBatch}>
          <div className="modal-title">NEW BATCH <kbd>esc</kbd></div>
          <div className="source-summary">
            <strong>{source.ledgerRef}</strong>
            <span>{source.tasks.length} repository tasks · {selection.size} selected</span>
          </div>
          {sourceError && <div className="source-error" aria-live="polite">! {sourceError}</div>}
          <label>batch name <span className="optional">optional</span><input name="name" placeholder="next construction batch" /></label>
          <div className="repo-task-picker" role="group" aria-label="Repository tasks">
            {source.tasks.map((task) => {
              const alreadyInBatch = existingRuntimeTaskIds.has(task.id)
              return (
                <label className={`repo-task-option ${alreadyInBatch ? 'disabled' : ''}`} key={task.id}>
                  <input
                    type="checkbox"
                    checked={selection.has(task.id)}
                    disabled={alreadyInBatch}
                    onChange={() => onToggleTask(task.id)}
                  />
                  <code>{task.id}</code>
                  <span className="repo-task-title">{task.title}</span>
                  <span className="repo-task-state">{alreadyInBatch ? 'in batch' : task.status}</span>
                </label>
              )
            })}
          </div>
          <p className="serial-note">Task Cards stay in the repository; Batch stores execution state only.</p>
          <button type="submit" disabled={batchSaving || selection.size === 0}>
            {batchSaving ? 'creating...' : `create batch with ${selection.size} task${selection.size === 1 ? '' : 's'}  ↵`}
          </button>
        </form>
      ) : (
        <form className="action-modal batch-modal" onSubmit={onConfigureSource}>
          <div className="modal-title">TASK SOURCE REQUIRED <kbd>esc</kbd></div>
          <div className="source-error" aria-live="polite">! {sourceError || 'repository task source is not configured'}</div>
          <p className="source-config-note">Configure repository-relative Markdown paths. Forge validates them before saving.</p>
          <label>task ledger<input name="taskLedger" defaultValue={selected.taskLedger ?? ''} placeholder="docs/workbench/00-work-ledger.md" required /></label>
          <label>task directory<input name="taskDir" defaultValue={selected.taskDir ?? ''} placeholder="docs/workbench/tasks" required /></label>
          <button type="submit" disabled={sourceSaving}>{sourceSaving ? 'validating...' : 'save source & load tasks  ↵'}</button>
        </form>
      )}
    </div>
  )
}

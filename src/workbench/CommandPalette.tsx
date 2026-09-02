import type { Dispatch, SelectedTask } from './model'

type CommandPaletteProps = {
  hasProject: boolean
  selectedTask: SelectedTask | null
  activeBuilderDispatch: Dispatch | null
  selectedActiveDispatch: Dispatch | null
  onNewProject: () => void
  onNewBatch: () => void
  onRefresh: () => void
  onDispatch: () => void
  onCancelDispatch: () => void
  onClose: () => void
}

export default function CommandPalette({
  hasProject,
  selectedTask,
  activeBuilderDispatch,
  selectedActiveDispatch,
  onNewProject,
  onNewBatch,
  onRefresh,
  onDispatch,
  onCancelDispatch,
  onClose,
}: CommandPaletteProps) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="command-palette">
        <div className="modal-title">COMMANDS <kbd>esc</kbd></div>
        <button onClick={onNewProject}><kbd>n</kbd><span>new project</span></button>
        <button disabled={!hasProject} onClick={onNewBatch}><kbd>b</kbd><span>new batch from repository tasks</span></button>
        <button onClick={onRefresh}><kbd>r</kbd><span>refresh state</span></button>
        <button disabled={!selectedTask || Boolean(activeBuilderDispatch)} onClick={onDispatch}>
          <kbd>d</kbd><span>{selectedTask ? `dispatch ${selectedTask.task.id}` : 'dispatch selected task'}</span>
        </button>
        <button disabled={!selectedActiveDispatch} onClick={onCancelDispatch}>
          <kbd>x</kbd><span>{selectedActiveDispatch ? `cancel ${selectedActiveDispatch.taskId}` : 'cancel active dispatch'}</span>
        </button>
        <button onClick={onClose}><kbd>q</kbd><span>close overlay</span></button>
      </div>
    </div>
  )
}

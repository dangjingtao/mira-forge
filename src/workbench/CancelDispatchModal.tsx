import type { FormEventHandler } from 'react'
import type { Dispatch } from './model'

type CancelDispatchModalProps = {
  target: Dispatch
  cancelling: boolean
  onSubmit: FormEventHandler<HTMLFormElement>
  onClose: () => void
}

export default function CancelDispatchModal({ target, cancelling, onSubmit, onClose }: CancelDispatchModalProps) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="action-modal cancel-modal" onSubmit={onSubmit}>
        <div className="modal-title">CANCEL {target.taskId} <kbd>esc</kbd></div>
        <div className="action-summary">
          <strong>{target.id}</strong>
          <span>{target.adapterId} · {target.status}</span>
        </div>
        <p className="cancel-copy">This sends SIGTERM to the supervised Builder and leaves the task interrupted.</p>
        <button type="submit" className="danger-action" disabled={cancelling}>
          {cancelling ? 'cancelling...' : 'cancel dispatch  ↵'}
        </button>
      </form>
    </div>
  )
}

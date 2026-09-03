import type { FormEventHandler, RefObject } from 'react'

type RegisterProjectModalProps = {
  inputRef: RefObject<HTMLInputElement | null>
  saving: boolean
  onSubmit: FormEventHandler<HTMLFormElement>
  onClose: () => void
}

export default function RegisterProjectModal({ inputRef, saving, onSubmit, onClose }: RegisterProjectModalProps) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="register-modal" onSubmit={onSubmit}>
        <div className="modal-title">REGISTER PROJECT <kbd>esc</kbd></div>
        <label>name<input ref={inputRef} name="name" placeholder="project name" required /></label>
        <label>root path<input name="rootPath" placeholder="/absolute/path/to/project" required /></label>
        <label>repository <span className="optional">optional</span><input name="repository" placeholder="https://github.com/..." /></label>
        <label>integration branch<input name="integrationBranch" defaultValue="dev" /></label>
        <div className="form-pair">
          <label>task ledger <span className="optional">optional</span><input name="taskLedger" placeholder="docs/workbench/00-work-ledger.md" /></label>
          <label>task directory <span className="optional">optional</span><input name="taskDir" placeholder="docs/workbench/tasks" /></label>
        </div>
        <button type="submit" disabled={saving}>{saving ? 'registering...' : 'register project  ↵'}</button>
      </form>
    </div>
  )
}

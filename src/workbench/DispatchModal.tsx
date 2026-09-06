import type { FormEventHandler, RefObject } from 'react'
import type { DispatchDraft, MainThread } from './model'
import { builderLabels } from './model'

type DispatchModalProps = {
  draft: DispatchDraft
  builderChoices: string[]
  mainThreads: MainThread[]
  inputRef: RefObject<HTMLInputElement | null>
  dispatching: boolean
  onSubmit: FormEventHandler<HTMLFormElement>
  onClose: () => void
}

export default function DispatchModal({
  draft,
  builderChoices,
  mainThreads,
  inputRef,
  dispatching,
  onSubmit,
  onClose,
}: DispatchModalProps) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="action-modal" onSubmit={onSubmit}>
        <div className="modal-title">DISPATCH {draft.task.id} <kbd>esc</kbd></div>
        <div className="action-summary">
          <strong>{draft.task.title}</strong>
          <span>repository task · serial Builder</span>
        </div>
        <label>
          Builder
          <select name="builder" defaultValue={builderChoices[0]} required>
            {builderChoices.map((builder) => <option value={builder} key={builder}>{builderLabels[builder] ?? builder}</option>)}
          </select>
        </label>
        <label>
          Result handoff <span className="optional">optional · result only</span>
          <select name="sourceThreadId" defaultValue="">
            <option value="">Keep Builder independent</option>
            {mainThreads.map((thread) => (
              <option value={thread.id} key={thread.id}>{thread.adapter} · {thread.title}</option>
            ))}
          </select>
        </label>
        <label>
          task card ref
          <input
            ref={inputRef}
            className="readonly-ref"
            name="taskRef"
            value={draft.taskRef}
            readOnly
            required
          />
        </label>
        <label>model <span className="optional">optional</span><input name="model" placeholder="provider/model" /></label>
        <label>agent <span className="optional">OpenCode only</span><input name="agent" placeholder="agent name" /></label>
        <p className="serial-note">result handoff does not share Main Thread conversation context · one active Builder dispatch at a time</p>
        <button type="submit" disabled={dispatching}>{dispatching ? 'dispatching...' : 'dispatch task  ↵'}</button>
      </form>
    </div>
  )
}

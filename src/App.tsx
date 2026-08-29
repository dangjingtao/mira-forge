import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Project = {
  id: string
  name: string
  rootPath: string
  repository: string | null
  integrationBranch: string
  taskDir?: string | null
}

type Task = {
  id: string
  title: string
  status: string
  builder: string | null
  reviewRound: number
}

type Batch = {
  id: string
  projectId: string
  name: string
  status: string
  tasks: Task[]
}

type Dispatch = {
  id: string
  projectId: string
  batchId: string
  taskId: string
  adapterId: string
  sessionId: string
  status: string
  externalSessionId: string | null
  pid: number | null
  error: string | null
  resultText: string | null
  createdAt: string
  updatedAt: string
}

type RuntimeEvent = {
  id: string
  type: string
  projectId: string | null
  batchId: string | null
  taskId: string | null
  dispatchId: string | null
  sessionId: string | null
  data: Record<string, unknown>
  createdAt: string
}

type ForgeState = {
  schemaVersion: number
  projects: Project[]
  batches: Batch[]
  dispatches?: Dispatch[]
  events?: RuntimeEvent[]
}

type SelectedTask = {
  batch: Batch
  task: Task
}

type DispatchReadiness = {
  ready: Array<{ taskId: string }>
  blocked: Array<{ taskId: string; reasons: Array<{ code: string }> }>
}

const statusLabels: Record<string, string> = {
  waiting: 'waiting',
  building: 'building',
  reviewing: 'reviewing',
  fixing: 'fixing',
  waiting_integration: 'waiting integration',
  interrupted: 'interrupted',
  stale: 'stale',
  review_passed: 'review passed',
  integrated: 'integrated',
}

const activeDispatchStatuses = new Set(['starting', 'running'])
const builtinBuilder = 'opencode-local'

function taskKey(batchId: string, taskId: string) {
  return `${batchId}:${taskId}`
}

function parseErrorBody(body: unknown, fallback: string) {
  if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') return body.message
  return fallback
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  return date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatEventData(event: RuntimeEvent) {
  const parts: string[] = []
  const { data } = event
  if (data.externalSessionId) parts.push(`session ${String(data.externalSessionId)}`)
  if (data.pid !== undefined && data.pid !== null) parts.push(`pid ${String(data.pid)}`)
  if (data.exitCode !== undefined && data.exitCode !== null) parts.push(`exit ${String(data.exitCode)}`)
  if (data.reason) parts.push(String(data.reason))
  if (data.message) parts.push(String(data.message))
  return parts.join(' · ')
}

function App() {
  const [state, setState] = useState<ForgeState | null>(null)
  const [connectionError, setConnectionError] = useState('')
  const [actionError, setActionError] = useState('')
  const [saving, setSaving] = useState(false)
  const [activeProject, setActiveProject] = useState(0)
  const [registering, setRegistering] = useState(false)
  const [palette, setPalette] = useState(false)
  const [selectedTaskKey, setSelectedTaskKey] = useState<string | null>(null)
  const [dispatchTask, setDispatchTask] = useState<SelectedTask | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Dispatch | null>(null)
  const [dispatching, setDispatching] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const taskRefInput = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/state')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setState(await response.json())
      setConnectionError('')
    } catch (cause) {
      setConnectionError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 2000)
    return () => window.clearInterval(timer)
  }, [load])

  useEffect(() => {
    if (registering) window.setTimeout(() => nameRef.current?.focus(), 0)
  }, [registering])

  useEffect(() => {
    if (dispatchTask) window.setTimeout(() => taskRefInput.current?.focus(), 0)
  }, [dispatchTask])

  const projects = state?.projects ?? []
  const selected = projects[activeProject]
  const batches = useMemo(
    () => selected ? (state?.batches.filter((batch) => batch.projectId === selected.id) ?? []) : [],
    [selected, state?.batches],
  )
  const dispatches = state?.dispatches ?? []
  const events = state?.events ?? []

  useEffect(() => {
    if (activeProject >= projects.length) setActiveProject(Math.max(projects.length - 1, 0))
  }, [activeProject, projects.length])

  useEffect(() => {
    setSelectedTaskKey(null)
  }, [selected?.id])

  const selectedTask = useMemo<SelectedTask | null>(() => {
    if (!selectedTaskKey) return null
    for (const batch of batches) {
      const task = batch.tasks.find((item) => taskKey(batch.id, item.id) === selectedTaskKey)
      if (task) return { batch, task }
    }
    return null
  }, [batches, selectedTaskKey])

  const selectedEvents = useMemo(
    () => selected ? events.filter((event) => event.projectId === selected.id) : [],
    [events, selected],
  )

  const activeBuilderDispatch = useMemo(
    () => dispatches.find((dispatch) => dispatch.adapterId === builtinBuilder && activeDispatchStatuses.has(dispatch.status)) ?? null,
    [dispatches],
  )

  const selectedActiveDispatch = useMemo(() => {
    if (!selectedTask) return null
    return dispatches.find(
      (dispatch) =>
        dispatch.batchId === selectedTask.batch.id
        && dispatch.taskId === selectedTask.task.id
        && activeDispatchStatuses.has(dispatch.status),
    ) ?? null
  }, [dispatches, selectedTask])

  const stats = useMemo(() => {
    const tasks = batches.flatMap((batch) => batch.tasks)
    return {
      total: tasks.length,
      active: tasks.filter((task) => ['building', 'fixing'].includes(task.status)).length,
      reviewing: tasks.filter((task) => task.status === 'reviewing').length,
      passed: tasks.filter((task) => ['review_passed', 'waiting_integration', 'integrated'].includes(task.status)).length,
    }
  }, [batches])

  const prepareDispatch = useCallback(async () => {
    if (!selectedTask) {
      setActionError('select a task row before dispatch')
      return
    }
    if (activeBuilderDispatch) {
      setActionError(`${builtinBuilder} is busy with ${activeBuilderDispatch.taskId}; first-use dispatch is serial`)
      return
    }

    try {
      const response = await fetch(`/api/batches/${encodeURIComponent(selectedTask.batch.id)}/dispatch-ready`)
      const body = await response.json()
      if (!response.ok) throw new Error(parseErrorBody(body, `HTTP ${response.status}`))

      const readiness = body as DispatchReadiness
      if (!readiness.ready.some((item) => item.taskId === selectedTask.task.id)) {
        const blocked = readiness.blocked.find((item) => item.taskId === selectedTask.task.id)
        const reasons = blocked?.reasons.map((reason) => reason.code).join(', ') || 'unknown reason'
        throw new Error(`task is not dispatch-ready: ${reasons}`)
      }

      setDispatchTask(selectedTask)
      setPalette(false)
      setActionError('')
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [activeBuilderDispatch, selectedTask])

  const prepareCancel = useCallback(() => {
    if (!selectedActiveDispatch) {
      setActionError('selected task has no active dispatch')
      return
    }
    setCancelTarget(selectedActiveDispatch)
    setPalette(false)
    setActionError('')
  }, [selectedActiveDispatch])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)

      if (event.key === 'Escape') {
        setPalette(false)
        setRegistering(false)
        setDispatchTask(null)
        setCancelTarget(null)
        return
      }

      if (typing) return
      if (registering || dispatchTask || cancelTarget) return

      if (palette) {
        if (event.key === 'q') {
          event.preventDefault()
          setPalette(false)
        } else if (event.key === 'n') {
          event.preventDefault()
          setRegistering(true)
          setPalette(false)
        } else if (event.key === 'r') {
          event.preventDefault()
          void load()
          setPalette(false)
        } else if (event.key === 'd') {
          event.preventDefault()
          void prepareDispatch()
        } else if (event.key === 'x') {
          event.preventDefault()
          prepareCancel()
        }
        return
      }

      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveProject((index) => Math.min(index + 1, Math.max(projects.length - 1, 0)))
      }
      if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveProject((index) => Math.max(index - 1, 0))
      }
      if (event.key === 'r') {
        event.preventDefault()
        void load()
      }
      if (event.key === 'n') {
        event.preventDefault()
        setRegistering(true)
      }
      if (event.key === '/') {
        event.preventDefault()
        setPalette(true)
      }
      if (event.key === 'q') {
        event.preventDefault()
        setPalette(false)
      }
      if (event.key === 'd') {
        event.preventDefault()
        void prepareDispatch()
      }
      if (event.key === 'x') {
        event.preventDefault()
        prepareCancel()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancelTarget, dispatchTask, load, palette, prepareCancel, prepareDispatch, projects.length, registering])

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          rootPath: form.get('rootPath'),
          repository: form.get('repository'),
          integrationBranch: form.get('integrationBranch'),
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(parseErrorBody(body, `HTTP ${response.status}`))
      event.currentTarget.reset()
      setRegistering(false)
      setActionError('')
      await load()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  async function submitDispatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!dispatchTask) return

    const form = new FormData(event.currentTarget)
    setDispatching(true)
    try {
      const response = await fetch(
        `/api/batches/${encodeURIComponent(dispatchTask.batch.id)}/tasks/${encodeURIComponent(dispatchTask.task.id)}/dispatch`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            adapterId: builtinBuilder,
            taskRef: form.get('taskRef'),
            model: form.get('model'),
            agent: form.get('agent'),
          }),
        },
      )
      const body = await response.json()
      if (!response.ok) throw new Error(parseErrorBody(body, `HTTP ${response.status}`))
      setDispatchTask(null)
      setActionError('')
      await load()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setDispatching(false)
    }
  }

  async function submitCancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cancelTarget) return

    setCancelling(true)
    try {
      const response = await fetch(`/api/dispatches/${encodeURIComponent(cancelTarget.id)}/cancel`, { method: 'POST' })
      const body = await response.json()
      if (!response.ok) throw new Error(parseErrorBody(body, `HTTP ${response.status}`))
      setCancelTarget(null)
      setActionError('')
      await load()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setCancelling(false)
    }
  }

  const defaultTaskRef = dispatchTask && selected?.taskDir
    ? `${selected.taskDir.replace(/\/$/, '')}/${dispatchTask.task.id}.md`
    : ''

  return (
    <main className="forge-tui">
      <header className="topbar">
        <span className="brand">MIRA FORGE</span>
        <span className="crumb">/ control plane / {selected?.name ?? 'workspace'}</span>
        <span className={`connection ${connectionError ? 'degraded' : ''}`}><i /> {connectionError ? 'LOCAL · DEGRADED' : 'LOCAL · LIVE'}</span>
      </header>

      <div className="workspace">
        <aside className="sidebar" aria-label="project navigator">
          <div className="side-title">WORKSPACES <span>{projects.length}</span></div>
          <div className="project-list">
            {projects.map((project, index) => (
              <button
                key={project.id}
                className={`project-item ${index === activeProject ? 'selected' : ''}`}
                onClick={() => setActiveProject(index)}
              >
                <span className="cursor">{index === activeProject ? '›' : ' '}</span>
                <span>
                  <strong>{project.name}</strong>
                  <small>{project.integrationBranch} · {state?.batches.filter((batch) => batch.projectId === project.id).length ?? 0} batches</small>
                </span>
              </button>
            ))}
          </div>
          <button className="new-project" onClick={() => setRegistering(true)}>
            <span>+</span> new project <kbd>n</kbd>
          </button>
          <div className="sidebar-foot"><span>v0.1.0</span><span>state: ~/.mira-forge</span></div>
        </aside>

        <section className="main-pane">
          <div className="pane-head">
            <div>
              <span className="eyebrow">PROJECT STATUS</span>
              <h1>{selected?.name ?? 'empty workspace'}</h1>
              <code>{selected?.rootPath ?? 'No project selected'}</code>
            </div>
            <button className="refresh" onClick={() => void load()} title="Refresh (r)">↻ <kbd>r</kbd></button>
          </div>

          {(actionError || connectionError) && <div className="error-line" aria-live="polite">! {actionError || `control service: ${connectionError}`}</div>}

          {selected ? (
            <>
              <div className="stat-line">
                <Stat label="tasks" value={stats.total} />
                <Stat label="building" value={stats.active} />
                <Stat label="reviewing" value={stats.reviewing} />
                <Stat label="passed" value={stats.passed} />
              </div>

              <div className="stream-label">
                RUNTIME STREAM
                <span>
                  {activeBuilderDispatch
                    ? `${builtinBuilder} busy · ${activeBuilderDispatch.taskId}`
                    : `${selectedEvents.length} events · ${batches.length} batches`}
                </span>
              </div>

              {batches.length ? batches.map((batch) => (
                <article className="batch" key={batch.id}>
                  <div className="batch-head"><strong>{batch.name}</strong><span>{batch.status}</span></div>
                  {batch.tasks.map((task) => {
                    const key = taskKey(batch.id, task.id)
                    const taskDispatch = dispatches.find(
                      (dispatch) => dispatch.batchId === batch.id && dispatch.taskId === task.id && activeDispatchStatuses.has(dispatch.status),
                    )
                    return (
                      <button
                        type="button"
                        className={`task task-button ${key === selectedTaskKey ? 'selected-task' : ''}`}
                        key={task.id}
                        aria-pressed={key === selectedTaskKey}
                        onClick={() => setSelectedTaskKey(key)}
                        onFocus={() => setSelectedTaskKey(key)}
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
                    <p>Forge only executes referenced project tasks. Create a Batch through the runtime API first.</p>
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
            <span><kbd>d</kbd> dispatch</span>
            <span><kbd>x</kbd> cancel</span>
            <span><kbd>n</kbd> new project</span>
            <span><kbd>/</kbd> commands</span>
            <span><kbd>r</kbd> refresh</span>
            <span><kbd>esc</kbd> close</span>
          </footer>
        </section>
      </div>

      {registering && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setRegistering(false) }}>
          <form className="register-modal" onSubmit={register}>
            <div className="modal-title">REGISTER PROJECT <kbd>esc</kbd></div>
            <label>name<input ref={nameRef} name="name" placeholder="project name" required /></label>
            <label>root path<input name="rootPath" placeholder="/absolute/path/to/project" required /></label>
            <label>repository <span className="optional">optional</span><input name="repository" placeholder="https://github.com/..." /></label>
            <label>integration branch<input name="integrationBranch" defaultValue="dev" /></label>
            <button type="submit" disabled={saving}>{saving ? 'registering...' : 'register project  ↵'}</button>
          </form>
        </div>
      )}

      {dispatchTask && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDispatchTask(null) }}>
          <form className="action-modal" onSubmit={submitDispatch}>
            <div className="modal-title">DISPATCH {dispatchTask.task.id} <kbd>esc</kbd></div>
            <div className="action-summary">
              <strong>{dispatchTask.task.title}</strong>
              <span>{builtinBuilder} · serial builder</span>
            </div>
            <label>
              task card ref
              <input
                ref={taskRefInput}
                name="taskRef"
                defaultValue={defaultTaskRef}
                placeholder={`path/to/${dispatchTask.task.id}.md`}
                required
              />
            </label>
            <label>model <span className="optional">optional</span><input name="model" placeholder="provider/model" /></label>
            <label>agent <span className="optional">optional</span><input name="agent" placeholder="OpenCode agent name" /></label>
            <p className="serial-note">one active Builder dispatch at a time · no auto-push / merge / deploy</p>
            <button type="submit" disabled={dispatching}>{dispatching ? 'dispatching...' : 'dispatch with opencode  ↵'}</button>
          </form>
        </div>
      )}

      {cancelTarget && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCancelTarget(null) }}>
          <form className="action-modal cancel-modal" onSubmit={submitCancel}>
            <div className="modal-title">CANCEL {cancelTarget.taskId} <kbd>esc</kbd></div>
            <div className="action-summary">
              <strong>{cancelTarget.id}</strong>
              <span>{cancelTarget.adapterId} · {cancelTarget.status}</span>
            </div>
            <p className="cancel-copy">This sends SIGTERM to the supervised Builder and leaves the task interrupted.</p>
            <button type="submit" className="danger-action" disabled={cancelling}>
              {cancelling ? 'cancelling...' : 'cancel dispatch  ↵'}
            </button>
          </form>
        </div>
      )}

      {palette && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPalette(false) }}>
          <div className="command-palette">
            <div className="modal-title">COMMANDS <kbd>esc</kbd></div>
            <button onClick={() => { setRegistering(true); setPalette(false) }}><kbd>n</kbd><span>new project</span></button>
            <button onClick={() => { void load(); setPalette(false) }}><kbd>r</kbd><span>refresh state</span></button>
            <button disabled={!selectedTask || Boolean(activeBuilderDispatch)} onClick={() => void prepareDispatch()}>
              <kbd>d</kbd><span>{selectedTask ? `dispatch ${selectedTask.task.id}` : 'dispatch selected task'}</span>
            </button>
            <button disabled={!selectedActiveDispatch} onClick={prepareCancel}>
              <kbd>x</kbd><span>{selectedActiveDispatch ? `cancel ${selectedActiveDispatch.taskId}` : 'cancel active dispatch'}</span>
            </button>
            <button onClick={() => setPalette(false)}><kbd>q</kbd><span>close overlay</span></button>
          </div>
        </div>
      )}
    </main>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return <span className="stat"><b>{value}</b> {label}</span>
}

export default App

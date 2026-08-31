import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Project = {
  id: string
  name: string
  rootPath: string
  repository: string | null
  integrationBranch: string
  taskLedger?: string | null
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

type ForgeMeta = {
  builderChoices?: string[]
}

type RepositoryTask = {
  id: string
  title: string
  status: string
}

type RepositoryTaskSource = {
  kind: string
  ledgerRef: string
  taskDirRef: string
  tasks: RepositoryTask[]
}

type ResolvedRepositoryTask = RepositoryTask & {
  cardStatus: string
  taskRef: string
  ledgerRef: string
  warnings: string[]
}

type SelectedTask = {
  batch: Batch
  task: Task
}

type DispatchDraft = SelectedTask & {
  taskRef: string
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

const builderLabels: Record<string, string> = {
  opencode: 'OpenCode',
  piagent: 'PiAgent',
  codex: 'Codex',
}

const activeDispatchStatuses = new Set(['starting', 'running'])

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
  const [meta, setMeta] = useState<ForgeMeta | null>(null)
  const [connectionError, setConnectionError] = useState('')
  const [actionError, setActionError] = useState('')
  const [saving, setSaving] = useState(false)
  const [activeProject, setActiveProject] = useState(0)
  const [registering, setRegistering] = useState(false)
  const [palette, setPalette] = useState(false)
  const [selectedTaskKey, setSelectedTaskKey] = useState<string | null>(null)
  const [dispatchTask, setDispatchTask] = useState<DispatchDraft | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Dispatch | null>(null)
  const [dispatching, setDispatching] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [batching, setBatching] = useState(false)
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchSaving, setBatchSaving] = useState(false)
  const [sourceSaving, setSourceSaving] = useState(false)
  const [batchSource, setBatchSource] = useState<RepositoryTaskSource | null>(null)
  const [batchSourceError, setBatchSourceError] = useState('')
  const [batchSelection, setBatchSelection] = useState<Set<string>>(new Set())
  const nameRef = useRef<HTMLInputElement>(null)
  const taskRefInput = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const [stateResponse, metaResponse] = await Promise.all([fetch('/api/state'), fetch('/api/meta')])
      if (!stateResponse.ok) throw new Error(`state HTTP ${stateResponse.status}`)
      if (!metaResponse.ok) throw new Error(`meta HTTP ${metaResponse.status}`)
      setState(await stateResponse.json())
      setMeta(await metaResponse.json())
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
  const builderChoices = meta?.builderChoices?.length ? meta.builderChoices : ['opencode', 'piagent', 'codex']

  useEffect(() => {
    if (activeProject >= projects.length) setActiveProject(Math.max(projects.length - 1, 0))
  }, [activeProject, projects.length])

  useEffect(() => {
    setSelectedTaskKey(null)
    setBatching(false)
    setBatchSource(null)
    setBatchSourceError('')
    setBatchSelection(new Set())
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
    () => dispatches.find((dispatch) => activeDispatchStatuses.has(dispatch.status)) ?? null,
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

  const existingRuntimeTaskIds = useMemo(() => new Set(
    batches
      .filter((batch) => batch.status !== 'integrated')
      .flatMap((batch) => batch.tasks.filter((task) => task.status !== 'integrated').map((task) => task.id)),
  ), [batches])

  const stats = useMemo(() => {
    const tasks = batches.flatMap((batch) => batch.tasks)
    return {
      total: tasks.length,
      active: tasks.filter((task) => ['building', 'fixing'].includes(task.status)).length,
      reviewing: tasks.filter((task) => task.status === 'reviewing').length,
      passed: tasks.filter((task) => ['review_passed', 'waiting_integration', 'integrated'].includes(task.status)).length,
    }
  }, [batches])

  const prepareBatch = useCallback(async () => {
    if (!selected) {
      setActionError('select a project before creating a batch')
      return
    }

    setBatching(true)
    setBatchLoading(true)
    setBatchSource(null)
    setBatchSourceError('')
    setBatchSelection(new Set())
    setPalette(false)
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(selected.id)}/tasks`)
      const body = await response.json()
      if (!response.ok) throw new Error(parseErrorBody(body, `HTTP ${response.status}`))
      setBatchSource(body as RepositoryTaskSource)
      setActionError('')
    } catch (cause) {
      setBatchSourceError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBatchLoading(false)
    }
  }, [selected])

  const prepareDispatch = useCallback(async () => {
    if (!selectedTask || !selected) {
      setActionError('select a task row before dispatch')
      return
    }
    if (activeBuilderDispatch) {
      setActionError(`${activeBuilderDispatch.adapterId} is busy with ${activeBuilderDispatch.taskId}; Builder dispatch is serial`)
      return
    }

    try {
      const readinessResponse = await fetch(`/api/batches/${encodeURIComponent(selectedTask.batch.id)}/dispatch-ready`)
      const readinessBody = await readinessResponse.json()
      if (!readinessResponse.ok) throw new Error(parseErrorBody(readinessBody, `HTTP ${readinessResponse.status}`))

      const readiness = readinessBody as DispatchReadiness
      if (!readiness.ready.some((item) => item.taskId === selectedTask.task.id)) {
        const blocked = readiness.blocked.find((item) => item.taskId === selectedTask.task.id)
        const reasons = blocked?.reasons.map((reason) => reason.code).join(', ') || 'unknown reason'
        throw new Error(`task is not dispatch-ready: ${reasons}`)
      }

      const taskResponse = await fetch(
        `/api/projects/${encodeURIComponent(selected.id)}/tasks/${encodeURIComponent(selectedTask.task.id)}`,
      )
      const taskBody = await taskResponse.json()
      if (!taskResponse.ok) throw new Error(parseErrorBody(taskBody, `HTTP ${taskResponse.status}`))
      const repositoryTask = taskBody as ResolvedRepositoryTask

      setDispatchTask({ ...selectedTask, taskRef: repositoryTask.taskRef })
      setPalette(false)
      setActionError('')
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [activeBuilderDispatch, selected, selectedTask])

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
        setBatching(false)
        return
      }

      if (typing) return
      if (registering || dispatchTask || cancelTarget || batching) return

      if (palette) {
        if (event.key === 'q') {
          event.preventDefault()
          setPalette(false)
        } else if (event.key === 'n') {
          event.preventDefault()
          setRegistering(true)
          setPalette(false)
        } else if (event.key === 'b') {
          event.preventDefault()
          void prepareBatch()
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
      if (event.key === 'b') {
        event.preventDefault()
        void prepareBatch()
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
  }, [batching, cancelTarget, dispatchTask, load, palette, prepareBatch, prepareCancel, prepareDispatch, projects.length, registering])

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
          taskLedger: form.get('taskLedger'),
          taskDir: form.get('taskDir'),
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

  async function configureTaskSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    const form = new FormData(event.currentTarget)
    setSourceSaving(true)
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(selected.id)}/task-source`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          taskLedger: form.get('taskLedger'),
          taskDir: form.get('taskDir'),
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(parseErrorBody(body, `HTTP ${response.status}`))
      setBatchSource(body.source as RepositoryTaskSource)
      setBatchSourceError('')
      setBatchSelection(new Set())
      setActionError('')
      await load()
    } catch (cause) {
      setBatchSourceError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSourceSaving(false)
    }
  }

  async function createBatchFromSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || !batchSource) return
    const taskIds = [...batchSelection]
    if (!taskIds.length) {
      setBatchSourceError('select at least one repository task')
      return
    }

    const form = new FormData(event.currentTarget)
    setBatchSaving(true)
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(selected.id)}/batches`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: form.get('name'), taskIds }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(parseErrorBody(body, `HTTP ${response.status}`))
      const created = body as Batch
      setBatching(false)
      setBatchSource(null)
      setBatchSourceError('')
      setBatchSelection(new Set())
      setActionError('')
      await load()
      if (created.tasks[0]) setSelectedTaskKey(taskKey(created.id, created.tasks[0].id))
    } catch (cause) {
      setBatchSourceError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBatchSaving(false)
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
            builder: form.get('builder'),
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

  function toggleBatchTask(taskId: string) {
    setBatchSelection((current) => {
      const next = new Set(current)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

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
                <span className="stream-heading">RUNTIME STREAM</span>
                <div className="stream-right">
                  <span className="stream-meta">
                    {activeBuilderDispatch
                      ? `${activeBuilderDispatch.adapterId} busy · ${activeBuilderDispatch.taskId}`
                      : `${selectedEvents.length} events · ${batches.length} batches`}
                  </span>
                  <button className="stream-action" type="button" onClick={() => void prepareBatch()}>
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
                    <p>Create a Batch from repository Task Cards. Forge keeps the cards in the repository as the source of truth.</p>
                    <button className="empty-action" type="button" onClick={() => void prepareBatch()}>
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
      </div>

      {registering && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setRegistering(false) }}>
          <form className="register-modal" onSubmit={register}>
            <div className="modal-title">REGISTER PROJECT <kbd>esc</kbd></div>
            <label>name<input ref={nameRef} name="name" placeholder="project name" required /></label>
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
      )}

      {batching && selected && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setBatching(false) }}>
          {batchLoading ? (
            <div className="action-modal batch-modal">
              <div className="modal-title">NEW BATCH <kbd>esc</kbd></div>
              <p className="modal-loading">loading repository task source...</p>
            </div>
          ) : batchSource ? (
            <form className="action-modal batch-modal" onSubmit={createBatchFromSource}>
              <div className="modal-title">NEW BATCH <kbd>esc</kbd></div>
              <div className="source-summary">
                <strong>{batchSource.ledgerRef}</strong>
                <span>{batchSource.tasks.length} repository tasks · {batchSelection.size} selected</span>
              </div>
              {batchSourceError && <div className="source-error" aria-live="polite">! {batchSourceError}</div>}
              <label>batch name <span className="optional">optional</span><input name="name" placeholder="next construction batch" /></label>
              <div className="repo-task-picker" role="group" aria-label="Repository tasks">
                {batchSource.tasks.map((task) => {
                  const alreadyInBatch = existingRuntimeTaskIds.has(task.id)
                  return (
                    <label className={`repo-task-option ${alreadyInBatch ? 'disabled' : ''}`} key={task.id}>
                      <input
                        type="checkbox"
                        checked={batchSelection.has(task.id)}
                        disabled={alreadyInBatch}
                        onChange={() => toggleBatchTask(task.id)}
                      />
                      <code>{task.id}</code>
                      <span className="repo-task-title">{task.title}</span>
                      <span className="repo-task-state">{alreadyInBatch ? 'in batch' : task.status}</span>
                    </label>
                  )
                })}
              </div>
              <p className="serial-note">Task Cards stay in the repository; Batch stores execution state only.</p>
              <button type="submit" disabled={batchSaving || batchSelection.size === 0}>
                {batchSaving ? 'creating...' : `create batch with ${batchSelection.size} task${batchSelection.size === 1 ? '' : 's'}  ↵`}
              </button>
            </form>
          ) : (
            <form className="action-modal batch-modal" onSubmit={configureTaskSource}>
              <div className="modal-title">TASK SOURCE REQUIRED <kbd>esc</kbd></div>
              <div className="source-error" aria-live="polite">! {batchSourceError || 'repository task source is not configured'}</div>
              <p className="source-config-note">Configure repository-relative Markdown paths. Forge validates them before saving.</p>
              <label>task ledger<input name="taskLedger" defaultValue={selected.taskLedger ?? ''} placeholder="docs/workbench/00-work-ledger.md" required /></label>
              <label>task directory<input name="taskDir" defaultValue={selected.taskDir ?? ''} placeholder="docs/workbench/tasks" required /></label>
              <button type="submit" disabled={sourceSaving}>{sourceSaving ? 'validating...' : 'save source & load tasks  ↵'}</button>
            </form>
          )}
        </div>
      )}

      {dispatchTask && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDispatchTask(null) }}>
          <form className="action-modal" onSubmit={submitDispatch}>
            <div className="modal-title">DISPATCH {dispatchTask.task.id} <kbd>esc</kbd></div>
            <div className="action-summary">
              <strong>{dispatchTask.task.title}</strong>
              <span>repository task · serial Builder</span>
            </div>
            <label>
              Builder
              <select name="builder" defaultValue={builderChoices[0]} required>
                {builderChoices.map((builder) => <option value={builder} key={builder}>{builderLabels[builder] ?? builder}</option>)}
              </select>
            </label>
            <label>
              task card ref
              <input
                ref={taskRefInput}
                className="readonly-ref"
                name="taskRef"
                value={dispatchTask.taskRef}
                readOnly
                required
              />
            </label>
            <label>model <span className="optional">optional</span><input name="model" placeholder="provider/model" /></label>
            <label>agent <span className="optional">OpenCode only</span><input name="agent" placeholder="agent name" /></label>
            <p className="serial-note">one active Builder dispatch at a time · no auto-push / merge / deploy</p>
            <button type="submit" disabled={dispatching}>{dispatching ? 'dispatching...' : 'dispatch task  ↵'}</button>
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
            <button disabled={!selected} onClick={() => void prepareBatch()}><kbd>b</kbd><span>new batch from repository tasks</span></button>
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

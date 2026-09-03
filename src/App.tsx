import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { focusMainThread } from './main-thread-focus'
import BatchModal from './workbench/BatchModal'
import CancelDispatchModal from './workbench/CancelDispatchModal'
import CommandPalette from './workbench/CommandPalette'
import DispatchModal from './workbench/DispatchModal'
import ProjectSidebar from './workbench/ProjectSidebar'
import RegisterProjectModal from './workbench/RegisterProjectModal'
import RuntimePane from './workbench/RuntimePane'
import TopBar from './workbench/TopBar'
import type {
  Batch,
  Dispatch,
  DispatchDraft,
  DispatchReadiness,
  ForgeMeta,
  ForgeState,
  RepositoryTaskSource,
  ResolvedRepositoryTask,
  SelectedTask,
} from './workbench/model'
import { activeDispatchStatuses, parseErrorBody, taskKey } from './workbench/model'

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
  const allBatches = state?.batches ?? []
  const batches = useMemo(
    () => selected ? allBatches.filter((batch) => batch.projectId === selected.id) : [],
    [selected, allBatches],
  )
  const dispatches = state?.dispatches ?? []
  const events = state?.events ?? []
  const sessions = state?.sessions ?? []
  const reviews = state?.reviews ?? []
  const threads = state?.threads ?? []
  const projectThreads = useMemo(
    () => selected ? threads.filter((thread) => thread.projectId === selected.id) : [],
    [selected, threads],
  )
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
            sourceThreadId: form.get('sourceThreadId') || undefined,
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
      <TopBar projectName={selected?.name} connectionError={connectionError} />

      <div className="workspace">
        <ProjectSidebar
          projects={projects}
          batches={allBatches}
          activeProject={activeProject}
          onSelectProject={setActiveProject}
          onNewProject={() => setRegistering(true)}
        />
        <RuntimePane
          selected={selected}
          actionError={actionError}
          connectionError={connectionError}
          stats={stats}
          batches={batches}
          dispatches={dispatches}
          sessions={sessions}
          reviews={reviews}
          threads={projectThreads}
          selectedTaskKey={selectedTaskKey}
          selectedEvents={selectedEvents}
          activeBuilderDispatch={activeBuilderDispatch}
          onRefresh={() => void load()}
          onNewBatch={() => void prepareBatch()}
          onSelectTask={setSelectedTaskKey}
          onOpenMainThread={focusMainThread}
        />
      </div>

      {registering && (
        <RegisterProjectModal
          inputRef={nameRef}
          saving={saving}
          onSubmit={register}
          onClose={() => setRegistering(false)}
        />
      )}

      {batching && selected && (
        <BatchModal
          selected={selected}
          loading={batchLoading}
          source={batchSource}
          sourceError={batchSourceError}
          selection={batchSelection}
          existingRuntimeTaskIds={existingRuntimeTaskIds}
          batchSaving={batchSaving}
          sourceSaving={sourceSaving}
          onToggleTask={toggleBatchTask}
          onCreateBatch={createBatchFromSource}
          onConfigureSource={configureTaskSource}
          onClose={() => setBatching(false)}
        />
      )}

      {dispatchTask && (
        <DispatchModal
          draft={dispatchTask}
          builderChoices={builderChoices}
          mainThreads={projectThreads}
          inputRef={taskRefInput}
          dispatching={dispatching}
          onSubmit={submitDispatch}
          onClose={() => setDispatchTask(null)}
        />
      )}

      {cancelTarget && (
        <CancelDispatchModal
          target={cancelTarget}
          cancelling={cancelling}
          onSubmit={submitCancel}
          onClose={() => setCancelTarget(null)}
        />
      )}

      {palette && (
        <CommandPalette
          hasProject={Boolean(selected)}
          selectedTask={selectedTask}
          activeBuilderDispatch={activeBuilderDispatch}
          selectedActiveDispatch={selectedActiveDispatch}
          onNewProject={() => { setRegistering(true); setPalette(false) }}
          onNewBatch={() => void prepareBatch()}
          onRefresh={() => { void load(); setPalette(false) }}
          onDispatch={() => void prepareDispatch()}
          onCancelDispatch={prepareCancel}
          onClose={() => setPalette(false)}
        />
      )}
    </main>
  )
}

export default App
import {
  createSession,
  heartbeatAdapter,
  registerAdapter,
  updateSession,
  updateTask,
} from './domain.mjs'
import {
  appendRuntimeEvent,
  createDispatch,
  getDispatches,
  isTerminalDispatch,
  transitionDispatch,
} from './dispatch-domain.mjs'
import {
  BUILTIN_BUILDERS,
  CODEX_ADAPTER_ID,
  OPENCODE_ADAPTER_ID,
  PIAGENT_ADAPTER_ID,
  resolveBuilderAdapterId,
} from './builder-contract.mjs'
import { getDispatchReadiness } from './readiness.mjs'

const ACTIVE_SESSION_STATUSES = ['starting', 'running', 'waiting']

function requiredString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`)
  return value.trim()
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function boundedString(value, limit = 256) {
  const text = optionalString(value)
  return text ? text.slice(0, limit) : null
}

function findDispatch(state, dispatchId) {
  const dispatch = getDispatches(state).find((item) => item.id === dispatchId)
  if (!dispatch) throw new Error('dispatch not found')
  return dispatch
}

function resolveBinding(state, batchId, taskId) {
  const batch = state.batches.find((item) => item.id === batchId)
  if (!batch) throw new Error('batch not found')
  const task = batch.tasks.find((item) => item.id === taskId)
  if (!task) throw new Error('task not found')
  const project = state.projects.find((item) => item.id === batch.projectId)
  if (!project) throw new Error('project not found')
  return { project, batch, task }
}

function ensureBuilderAdapter(state, adapterId) {
  let adapter = (state.adapters ?? []).find((item) => item.id === adapterId)
  const builtin = BUILTIN_BUILDERS[adapterId]
  if (!adapter && builtin) {
    adapter = registerAdapter(state, {
      id: builtin.id,
      name: builtin.name,
      kind: builtin.kind,
      capabilities: [...builtin.capabilities],
    })
  }
  if (!adapter) throw new Error('adapterId not found')
  if (adapter.kind !== 'builder') throw new Error('dispatch requires a builder adapter')
  return adapter
}

function findActiveBuilderDispatch(state) {
  return getDispatches(state).find((dispatch) => !isTerminalDispatch(dispatch.status))
}

function observedExternalSessionId(event) {
  return optionalString(event?.externalSessionId)
    || optionalString(event?.sessionID)
    || optionalString(event?.thread_id)
    || optionalString(event?.threadId)
}

function providerEventData(event) {
  if (!event?.provider || typeof event.provider !== 'object') return null
  const provider = {
    adapter: boundedString(event.provider.adapter, 80),
    eventType: boundedString(event.provider.eventType, 120),
    itemType: boundedString(event.provider.itemType, 120),
    status: boundedString(event.provider.status, 80),
  }
  const tool = event?.tool && typeof event.tool === 'object'
    ? {
        name: boundedString(event.tool.name, 160),
        status: boundedString(event.tool.status, 80),
      }
    : null
  const artifact = event?.artifact && typeof event.artifact === 'object'
    ? {
        kind: boundedString(event.artifact.kind, 80),
        ref: boundedString(event.artifact.ref, 512),
      }
    : null
  return { provider, tool, artifact }
}

export function buildTaskDispatchPrompt({ project, batch, task, taskRef }) {
  const ref = requiredString(taskRef, 'taskRef')
  const base = task.baseSha || batch.baseSha || null
  return [
    '# Task Dispatch',
    '',
    `Task: ${task.id}`,
    `Project: ${project.name}`,
    `Base: ${project.integrationBranch}${base ? ` @ ${base}` : ''}`,
    `Goal: ${task.title}`,
    '',
    '## Must Read',
    '- AGENTS.md',
    `- ${ref}`,
    '',
    '## Hard Constraints',
    '- Treat the current repository files as authoritative if they conflict with this dispatch message.',
    '- Stay inside the task scope; do not perform unrelated refactors.',
    '- Do not push, merge, deploy, publish, or broaden permissions.',
    '- If a missing fact would change implementation direction, stop at that decision point and report it instead of guessing.',
    '',
    '## Validation',
    '- Run the repository/task-relevant checks before handoff.',
    '',
    '## Handoff',
    '- Report what changed, validation evidence, remaining risks, and any human decision still required.',
  ].join('\n')
}

function resolvePrompt(input, binding) {
  const inline = optionalString(input.prompt)
  if (inline) return { prompt: inline, promptSource: 'inline', taskRef: optionalString(input.taskRef) }

  const taskRef = optionalString(input.taskRef)
  if (!taskRef) throw new Error('prompt or taskRef is required')
  return {
    prompt: buildTaskDispatchPrompt({ ...binding, taskRef }),
    promptSource: 'task_ref',
    taskRef,
  }
}

function dispatchEvent(state, dispatch, type, data = {}) {
  return appendRuntimeEvent(state, {
    type,
    projectId: dispatch.projectId,
    batchId: dispatch.batchId,
    taskId: dispatch.taskId,
    dispatchId: dispatch.id,
    sessionId: dispatch.sessionId,
    data,
  })
}

export function createDispatchManager({ store, runners }) {
  if (!store?.read || !store?.mutate) throw new Error('store is required')
  if (!(runners instanceof Map)) throw new Error('runners must be a Map')

  const handles = new Map()

  async function markStarted(dispatchId, info = {}) {
    await store.mutate((state) => {
      const dispatch = findDispatch(state, dispatchId)
      if (isTerminalDispatch(dispatch.status)) return dispatch
      transitionDispatch(state, dispatch.id, 'running', { pid: info.pid ?? null })
      const session = (state.sessions ?? []).find((item) => item.id === dispatch.sessionId)
      if (session && ACTIVE_SESSION_STATUSES.includes(session.status)) updateSession(state, session.id, { status: 'running' })
      heartbeatAdapter(state, dispatch.adapterId, { status: 'busy' })
      dispatchEvent(state, dispatch, 'dispatch.started', { pid: info.pid ?? null })
      return dispatch
    })
  }

  async function observeEvent(dispatchId, event) {
    const externalSessionId = observedExternalSessionId(event)
    const evidence = providerEventData(event)
    if (!externalSessionId && !evidence) return

    await store.mutate((state) => {
      const dispatch = findDispatch(state, dispatchId)
      if (isTerminalDispatch(dispatch.status)) return dispatch

      if (externalSessionId && dispatch.externalSessionId && dispatch.externalSessionId !== externalSessionId) {
        dispatchEvent(state, dispatch, 'dispatch.warning', {
          code: 'external_session_changed',
          observedSessionId: externalSessionId,
        })
      } else if (externalSessionId && dispatch.externalSessionId !== externalSessionId) {
        transitionDispatch(state, dispatch.id, dispatch.status, { externalSessionId })
        const session = (state.sessions ?? []).find((item) => item.id === dispatch.sessionId)
        if (session) updateSession(state, session.id, { externalSessionId })
        dispatchEvent(state, dispatch, 'dispatch.session_bound', { externalSessionId })
      }

      if (evidence) dispatchEvent(state, dispatch, 'dispatch.provider_event', evidence)
      return dispatch
    })
  }

  async function finishDispatch(dispatchId, result) {
    handles.delete(dispatchId)
    await store.mutate((state) => {
      const dispatch = findDispatch(state, dispatchId)
      if (isTerminalDispatch(dispatch.status)) return dispatch
      const { batch, task } = resolveBinding(state, dispatch.batchId, dispatch.taskId)
      const session = (state.sessions ?? []).find((item) => item.id === dispatch.sessionId)
      const providerError = optionalString(result.errorText)
      const success = result.code === 0 && !providerError

      if (session && ACTIVE_SESSION_STATUSES.includes(session.status)) {
        updateSession(state, session.id, { status: success ? 'completed' : 'failed' })
      }
      updateTask(state, batch.id, task.id, { status: success ? 'reviewing' : 'interrupted' })
      heartbeatAdapter(state, dispatch.adapterId, { status: 'available' })

      if (success) {
        transitionDispatch(state, dispatch.id, 'completed', {
          exitCode: 0,
          signal: result.signal ?? null,
          resultText: result.resultText ?? null,
          error: null,
        })
        dispatchEvent(state, dispatch, 'dispatch.completed', {
          exitCode: 0,
          signal: result.signal ?? null,
          externalSessionId: dispatch.externalSessionId,
        })
      } else {
        const message = providerError || optionalString(result.stderr) || `Builder exited with code ${result.code ?? 'unknown'}`
        transitionDispatch(state, dispatch.id, 'failed', {
          exitCode: result.code ?? null,
          signal: result.signal ?? null,
          resultText: result.resultText ?? null,
          error: message,
        })
        dispatchEvent(state, dispatch, 'dispatch.failed', {
          exitCode: result.code ?? null,
          signal: result.signal ?? null,
          message,
        })
      }
      return dispatch
    })
  }

  async function failDispatch(dispatchId, error, details = {}) {
    handles.delete(dispatchId)
    const message = error instanceof Error ? error.message : String(error)
    await store.mutate((state) => {
      const dispatch = findDispatch(state, dispatchId)
      if (isTerminalDispatch(dispatch.status)) return dispatch
      const { batch, task } = resolveBinding(state, dispatch.batchId, dispatch.taskId)
      const session = (state.sessions ?? []).find((item) => item.id === dispatch.sessionId)
      if (session && ACTIVE_SESSION_STATUSES.includes(session.status)) updateSession(state, session.id, { status: 'failed' })
      updateTask(state, batch.id, task.id, { status: 'interrupted' })
      heartbeatAdapter(state, dispatch.adapterId, { status: 'error' })
      transitionDispatch(state, dispatch.id, 'failed', {
        error: optionalString(details.stderr) || message,
      })
      dispatchEvent(state, dispatch, 'dispatch.failed', { message })
      return dispatch
    })
  }

  async function dispatchTask(input) {
    const batchId = requiredString(input.batchId, 'batchId')
    const taskId = requiredString(input.taskId, 'taskId')
    const adapterId = resolveBuilderAdapterId(input)
    const runner = runners.get(adapterId)
    if (!runner) throw new Error(`no runner configured for adapter: ${adapterId}`)

    const prepared = await store.mutate((state) => {
      const binding = resolveBinding(state, batchId, taskId)
      const readiness = getDispatchReadiness(state, batchId)
      const ready = readiness.ready.find((item) => item.taskId === taskId)
      if (!ready) {
        const blocked = readiness.blocked.find((item) => item.taskId === taskId)
        throw new Error(`task is not dispatch-ready: ${JSON.stringify(blocked?.reasons ?? [])}`)
      }

      const adapter = ensureBuilderAdapter(state, adapterId)
      const activeBuilderDispatch = findActiveBuilderDispatch(state)
      if (activeBuilderDispatch) {
        throw new Error(`builder dispatch already active: ${activeBuilderDispatch.id}`)
      }

      const promptInfo = resolvePrompt(input, binding)
      const session = createSession(state, {
        role: 'builder',
        adapterId: adapter.id,
        projectId: binding.project.id,
        batchId,
        taskId,
      })
      updateTask(state, batchId, taskId, { status: 'building', builder: adapter.id })
      const dispatch = createDispatch(state, {
        projectId: binding.project.id,
        batchId,
        taskId,
        adapterId: adapter.id,
        sessionId: session.id,
        promptSource: promptInfo.promptSource,
        taskRef: promptInfo.taskRef,
        model: input.model,
        agent: input.agent,
      })
      dispatchEvent(state, dispatch, 'dispatch.queued', {
        adapterId: adapter.id,
        promptSource: dispatch.promptSource,
        taskRef: dispatch.taskRef,
      })
      return {
        dispatch: structuredClone(dispatch),
        project: structuredClone(binding.project),
        prompt: promptInfo.prompt,
      }
    })

    try {
      const handle = runner.start({
        projectRoot: prepared.project.rootPath,
        prompt: prepared.prompt,
        model: optionalString(input.model),
        agent: optionalString(input.agent),
        onStarted: (info) => { void markStarted(prepared.dispatch.id, info) },
        onEvent: (event) => { void observeEvent(prepared.dispatch.id, event) },
        onExit: (result) => { void finishDispatch(prepared.dispatch.id, result) },
        onError: (error, details) => { void failDispatch(prepared.dispatch.id, error, details) },
      })
      handles.set(prepared.dispatch.id, handle)
    } catch (error) {
      await failDispatch(prepared.dispatch.id, error)
    }

    return prepared.dispatch
  }

  async function cancelDispatch(dispatchId) {
    const id = requiredString(dispatchId, 'dispatchId')
    const handle = handles.get(id)
    const result = await store.mutate((state) => {
      const dispatch = findDispatch(state, id)
      if (isTerminalDispatch(dispatch.status)) return { dispatch, changed: false }
      const { batch, task } = resolveBinding(state, dispatch.batchId, dispatch.taskId)
      const session = (state.sessions ?? []).find((item) => item.id === dispatch.sessionId)
      if (session && ACTIVE_SESSION_STATUSES.includes(session.status)) updateSession(state, session.id, { status: 'disconnected' })
      updateTask(state, batch.id, task.id, { status: 'interrupted' })
      heartbeatAdapter(state, dispatch.adapterId, { status: 'available' })
      transitionDispatch(state, dispatch.id, 'cancelled', { signal: 'SIGTERM' })
      dispatchEvent(state, dispatch, 'dispatch.cancelled', {})
      return { dispatch: structuredClone(dispatch), changed: true }
    })

    if (result.changed) {
      handles.delete(id)
      handle?.kill?.('SIGTERM')
    }
    return result.dispatch
  }

  async function reconcile() {
    return store.mutate((state) => {
      let count = 0
      for (const dispatch of getDispatches(state)) {
        if (isTerminalDispatch(dispatch.status)) continue
        const session = (state.sessions ?? []).find((item) => item.id === dispatch.sessionId)
        if (session && ACTIVE_SESSION_STATUSES.includes(session.status)) updateSession(state, session.id, { status: 'disconnected' })
        const binding = resolveBinding(state, dispatch.batchId, dispatch.taskId)
        if (binding.task.status === 'building') updateTask(state, dispatch.batchId, dispatch.taskId, { status: 'interrupted' })
        const adapter = (state.adapters ?? []).find((item) => item.id === dispatch.adapterId)
        if (adapter) {
          adapter.status = 'offline'
          adapter.updatedAt = new Date().toISOString()
        }
        transitionDispatch(state, dispatch.id, 'interrupted', { error: 'control plane restarted; process supervision was lost' })
        dispatchEvent(state, dispatch, 'dispatch.interrupted', { reason: 'control_plane_restart' })
        count += 1
      }
      return count
    })
  }

  async function shutdown() {
    const ids = [...handles.keys()]
    for (const id of ids) {
      const handle = handles.get(id)
      await store.mutate((state) => {
        const dispatch = findDispatch(state, id)
        if (isTerminalDispatch(dispatch.status)) return dispatch
        const { batch, task } = resolveBinding(state, dispatch.batchId, dispatch.taskId)
        const session = (state.sessions ?? []).find((item) => item.id === dispatch.sessionId)
        if (session && ACTIVE_SESSION_STATUSES.includes(session.status)) updateSession(state, session.id, { status: 'disconnected' })
        updateTask(state, batch.id, task.id, { status: 'interrupted' })
        heartbeatAdapter(state, dispatch.adapterId, { status: 'offline' })
        transitionDispatch(state, dispatch.id, 'interrupted', { signal: 'SIGTERM', error: 'control plane shutdown' })
        dispatchEvent(state, dispatch, 'dispatch.interrupted', { reason: 'control_plane_shutdown' })
        return dispatch
      })
      handles.delete(id)
      handle?.kill?.('SIGTERM')
    }
  }

  return {
    dispatchTask,
    cancelDispatch,
    reconcile,
    shutdown,
  }
}

export { CODEX_ADAPTER_ID, OPENCODE_ADAPTER_ID, PIAGENT_ADAPTER_ID }

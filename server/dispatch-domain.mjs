import { randomUUID } from 'node:crypto'

export const DISPATCH_STATUSES = ['starting', 'running', 'completed', 'failed', 'cancelled', 'interrupted']
export const TERMINAL_DISPATCH_STATUSES = ['completed', 'failed', 'cancelled', 'interrupted']

const DISPATCH_TRANSITIONS = {
  starting: ['running', 'completed', 'failed', 'cancelled', 'interrupted'],
  running: ['completed', 'failed', 'cancelled', 'interrupted'],
  completed: [],
  failed: [],
  cancelled: [],
  interrupted: [],
}

function now() {
  return new Date().toISOString()
}

function requiredString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`)
  return value.trim()
}

function nullableString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function stateList(state, key) {
  if (!Array.isArray(state[key])) state[key] = []
  return state[key]
}

export function getDispatches(state) {
  return stateList(state, 'dispatches')
}

export function getRuntimeEvents(state) {
  return stateList(state, 'events')
}

export function isTerminalDispatch(status) {
  return TERMINAL_DISPATCH_STATUSES.includes(status)
}

export function createDispatch(state, input) {
  const timestamp = now()
  const dispatch = {
    id: typeof input.id === 'string' && input.id.trim() ? input.id.trim() : `D-${randomUUID().slice(0, 12)}`,
    projectId: requiredString(input.projectId, 'projectId'),
    batchId: requiredString(input.batchId, 'batchId'),
    taskId: requiredString(input.taskId, 'taskId'),
    adapterId: requiredString(input.adapterId, 'adapterId'),
    sessionId: requiredString(input.sessionId, 'sessionId'),
    status: 'starting',
    promptSource: input.promptSource === 'task_ref' ? 'task_ref' : 'inline',
    taskRef: nullableString(input.taskRef),
    model: nullableString(input.model),
    agent: nullableString(input.agent),
    externalSessionId: null,
    pid: null,
    exitCode: null,
    signal: null,
    error: null,
    resultText: null,
    startedAt: null,
    endedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  if (getDispatches(state).some((item) => item.id === dispatch.id)) {
    throw new Error(`duplicate dispatch id: ${dispatch.id}`)
  }
  getDispatches(state).push(dispatch)
  return dispatch
}

export function transitionDispatch(state, dispatchId, nextStatus, patch = {}) {
  const dispatch = getDispatches(state).find((item) => item.id === dispatchId)
  if (!dispatch) throw new Error('dispatch not found')
  if (!DISPATCH_STATUSES.includes(nextStatus)) throw new Error(`invalid dispatch status: ${nextStatus}`)

  if (nextStatus !== dispatch.status && !DISPATCH_TRANSITIONS[dispatch.status]?.includes(nextStatus)) {
    throw new Error(`invalid dispatch transition: ${dispatch.status} -> ${nextStatus}`)
  }

  const timestamp = now()
  if (nextStatus === 'running' && !dispatch.startedAt) dispatch.startedAt = timestamp
  if (isTerminalDispatch(nextStatus) && !dispatch.endedAt) dispatch.endedAt = timestamp
  dispatch.status = nextStatus

  for (const field of ['externalSessionId', 'pid', 'exitCode', 'signal', 'error', 'resultText']) {
    if (patch[field] !== undefined) dispatch[field] = patch[field]
  }
  dispatch.updatedAt = timestamp
  return dispatch
}

export function appendRuntimeEvent(state, input) {
  const timestamp = now()
  const event = {
    id: typeof input.id === 'string' && input.id.trim() ? input.id.trim() : `E-${randomUUID().slice(0, 12)}`,
    type: requiredString(input.type, 'type'),
    projectId: nullableString(input.projectId),
    batchId: nullableString(input.batchId),
    taskId: nullableString(input.taskId),
    dispatchId: nullableString(input.dispatchId),
    sessionId: nullableString(input.sessionId),
    data: input.data && typeof input.data === 'object' && !Array.isArray(input.data) ? input.data : {},
    createdAt: timestamp,
  }
  getRuntimeEvents(state).push(event)
  return event
}

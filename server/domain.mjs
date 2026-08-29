import { randomUUID } from 'node:crypto'

export const TASK_STATUSES = [
  'waiting',
  'building',
  'reviewing',
  'fixing',
  'waiting_integration',
  'interrupted',
  'stale',
  'review_passed',
  'integrated',
]

export const ADAPTER_KINDS = ['builder', 'reviewer', 'git']
export const ADAPTER_STATUSES = ['available', 'busy', 'offline', 'error']
export const SESSION_ROLES = ['builder', 'reviewer']
export const SESSION_STATUSES = ['starting', 'running', 'waiting', 'completed', 'failed', 'disconnected']
export const REVIEW_STATUSES = ['requested', 'passed', 'changes_requested', 'failed', 'cancelled']

const ACTIVE_SESSION_STATUSES = ['starting', 'running', 'waiting']
const TERMINAL_SESSION_STATUSES = ['completed', 'failed', 'disconnected']
const REVIEW_RESULTS = ['passed', 'changes_requested', 'failed', 'cancelled']
const SESSION_TRANSITIONS = {
  starting: ['running', 'completed', 'failed', 'disconnected'],
  running: ['waiting', 'completed', 'failed', 'disconnected'],
  waiting: ['running', 'completed', 'failed', 'disconnected'],
  completed: [],
  failed: [],
  disconnected: [],
}

function now() {
  return new Date().toISOString()
}

function requiredString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`)
  return value.trim()
}

function stringList(value, name) {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`)
  const items = value.map((item) => requiredString(item, `${name} item`))
  return [...new Set(items)]
}

function adapters(state) {
  if (!Array.isArray(state.adapters)) state.adapters = []
  return state.adapters
}

function sessions(state) {
  if (!Array.isArray(state.sessions)) state.sessions = []
  return state.sessions
}

function reviews(state) {
  if (!Array.isArray(state.reviews)) state.reviews = []
  return state.reviews
}

function nextUniqueId(items, inputId, prefix, name) {
  const explicitId = typeof inputId === 'string' ? inputId.trim() : ''
  if (explicitId) {
    if (items.some((item) => item.id === explicitId)) throw new Error(`duplicate ${name} id: ${explicitId}`)
    return explicitId
  }

  let id
  do {
    id = prefix ? `${prefix}-${randomUUID().slice(0, 12)}` : randomUUID()
  } while (items.some((item) => item.id === id))
  return id
}

function nextBatchId(state, inputId) {
  const explicitId = typeof inputId === 'string' ? inputId.trim() : ''
  if (explicitId) {
    if (state.batches.some((batch) => batch.id === explicitId)) throw new Error(`duplicate batch id: ${explicitId}`)
    return explicitId
  }

  let id
  do {
    id = `B-${randomUUID().slice(0, 8)}`
  } while (state.batches.some((batch) => batch.id === id))
  return id
}

function resolveTaskBinding(state, projectId, batchId, taskId) {
  const project = state.projects.find((item) => item.id === projectId)
  if (!project) throw new Error('projectId not found')
  const batch = state.batches.find((item) => item.id === batchId && item.projectId === projectId)
  if (!batch) throw new Error('batchId not found for project')
  const task = batch.tasks.find((item) => item.id === taskId)
  if (!task) throw new Error('taskId not found in batch')
  return { project, batch, task }
}

function deriveBatchStatus(tasks) {
  if (tasks.every((task) => task.status === 'integrated')) return 'integrated'
  if (tasks.some((task) => task.status === 'interrupted' || task.status === 'stale')) return 'attention'
  if (tasks.some((task) => task.status === 'building' || task.status === 'fixing')) return 'active'
  if (tasks.some((task) => task.status === 'reviewing')) return 'reviewing'
  if (tasks.every((task) => ['review_passed', 'waiting_integration', 'integrated'].includes(task.status))) return 'waiting_integration'
  return 'planned'
}

export function registerAdapter(state, input) {
  const kind = requiredString(input.kind, 'kind')
  if (!ADAPTER_KINDS.includes(kind)) throw new Error(`invalid adapter kind: ${kind}`)

  const status = input.status === undefined ? 'offline' : requiredString(input.status, 'status')
  if (!ADAPTER_STATUSES.includes(status)) throw new Error(`invalid adapter status: ${status}`)

  const timestamp = now()
  const adapter = {
    id: nextUniqueId(adapters(state), input.id, '', 'adapter'),
    name: requiredString(input.name, 'name'),
    kind,
    capabilities: stringList(input.capabilities, 'capabilities'),
    status,
    lastSeenAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  adapters(state).push(adapter)
  return adapter
}

export function heartbeatAdapter(state, adapterId, input = {}) {
  const adapter = adapters(state).find((item) => item.id === adapterId)
  if (!adapter) throw new Error('adapter not found')

  const status = input.status === undefined ? 'available' : requiredString(input.status, 'status')
  if (!ADAPTER_STATUSES.includes(status)) throw new Error(`invalid adapter status: ${status}`)

  const timestamp = now()
  adapter.status = status
  adapter.lastSeenAt = timestamp
  adapter.updatedAt = timestamp
  return adapter
}

export function createSession(state, input) {
  const role = requiredString(input.role, 'role')
  if (!SESSION_ROLES.includes(role)) throw new Error(`invalid session role: ${role}`)

  const adapterId = requiredString(input.adapterId, 'adapterId')
  const adapter = adapters(state).find((item) => item.id === adapterId)
  if (!adapter) throw new Error('adapterId not found')
  if (adapter.kind !== role) throw new Error(`adapter kind ${adapter.kind} is incompatible with session role ${role}`)

  const projectId = requiredString(input.projectId, 'projectId')
  const batchId = requiredString(input.batchId, 'batchId')
  const taskId = requiredString(input.taskId, 'taskId')
  const { task } = resolveTaskBinding(state, projectId, batchId, taskId)

  const active = sessions(state).find((session) =>
    session.projectId === projectId
    && session.batchId === batchId
    && session.taskId === taskId
    && session.role === role
    && ACTIVE_SESSION_STATUSES.includes(session.status))
  if (active) throw new Error(`active ${role} session already exists for task`)

  const timestamp = now()
  const session = {
    id: nextUniqueId(sessions(state), input.id, 'S', 'session'),
    role,
    adapterId,
    projectId,
    batchId,
    taskId,
    status: 'starting',
    externalSessionId: typeof input.externalSessionId === 'string' && input.externalSessionId.trim() ? input.externalSessionId.trim() : null,
    startedAt: null,
    endedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  sessions(state).push(session)

  if (role === 'builder') task.builderSessionId = session.id
  if (role === 'reviewer') task.reviewerSessionId = session.id
  task.updatedAt = timestamp
  return session
}

export function updateSession(state, sessionId, patch) {
  const session = sessions(state).find((item) => item.id === sessionId)
  if (!session) throw new Error('session not found')

  const timestamp = now()
  if (patch.status !== undefined) {
    const nextStatus = requiredString(patch.status, 'status')
    if (!SESSION_STATUSES.includes(nextStatus)) throw new Error(`invalid session status: ${nextStatus}`)
    if (nextStatus !== session.status && !SESSION_TRANSITIONS[session.status].includes(nextStatus)) {
      throw new Error(`invalid session transition: ${session.status} -> ${nextStatus}`)
    }
    if (session.status !== 'running' && nextStatus === 'running' && !session.startedAt) session.startedAt = timestamp
    if (TERMINAL_SESSION_STATUSES.includes(nextStatus)) session.endedAt = timestamp
    session.status = nextStatus
  }

  if (patch.externalSessionId !== undefined) {
    session.externalSessionId = typeof patch.externalSessionId === 'string' && patch.externalSessionId.trim()
      ? patch.externalSessionId.trim()
      : null
  }

  session.updatedAt = timestamp
  return session
}

export function createReviewHandoff(state, input) {
  const projectId = requiredString(input.projectId, 'projectId')
  const batchId = requiredString(input.batchId, 'batchId')
  const taskId = requiredString(input.taskId, 'taskId')
  const requestedSha = requiredString(input.sha, 'sha')
  const reviewerSessionId = requiredString(input.reviewerSessionId, 'reviewerSessionId')
  const { batch, task } = resolveTaskBinding(state, projectId, batchId, taskId)

  if (!task.currentSha) throw new Error('task currentSha is required before review handoff')
  if (task.currentSha !== requestedSha) throw new Error('review sha must match task currentSha')

  const reviewerSession = sessions(state).find((session) => session.id === reviewerSessionId)
  if (!reviewerSession) throw new Error('reviewerSessionId not found')
  if (reviewerSession.role !== 'reviewer') throw new Error('review handoff requires a reviewer session')
  if (reviewerSession.projectId !== projectId || reviewerSession.batchId !== batchId || reviewerSession.taskId !== taskId) {
    throw new Error('reviewer session is bound to a different task')
  }
  if (!ACTIVE_SESSION_STATUSES.includes(reviewerSession.status)) throw new Error('reviewer session is not active')

  const pending = reviews(state).find((review) =>
    review.projectId === projectId
    && review.batchId === batchId
    && review.taskId === taskId
    && review.status === 'requested')
  if (pending) throw new Error('pending review handoff already exists for task')

  const timestamp = now()
  const round = (Number.isInteger(task.reviewRound) ? task.reviewRound : 0) + 1
  const review = {
    id: nextUniqueId(reviews(state), input.id, 'R', 'review'),
    projectId,
    batchId,
    taskId,
    reviewerSessionId,
    round,
    requestedSha,
    reviewedSha: null,
    status: 'requested',
    actionable: null,
    invalidatedAt: null,
    resolvedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  reviews(state).push(review)

  task.reviewRound = round
  task.reviewerSessionId = reviewerSessionId
  task.status = 'reviewing'
  task.updatedAt = timestamp
  batch.updatedAt = timestamp
  batch.status = deriveBatchStatus(batch.tasks)
  return review
}

export function resolveReviewHandoff(state, reviewId, input) {
  const review = reviews(state).find((item) => item.id === reviewId)
  if (!review) throw new Error('review not found')
  if (review.status !== 'requested') throw new Error('review handoff is already resolved')

  const result = requiredString(input.result, 'result')
  if (!REVIEW_RESULTS.includes(result)) throw new Error(`invalid review result: ${result}`)
  const { batch, task } = resolveTaskBinding(state, review.projectId, review.batchId, review.taskId)

  let reviewedSha = null
  if (result !== 'cancelled') {
    reviewedSha = requiredString(input.reviewedSha, 'reviewedSha')
    if (reviewedSha !== review.requestedSha) throw new Error('reviewedSha must match review requestedSha')
  }

  const timestamp = now()
  const actionable = result !== 'cancelled' && task.currentSha === review.requestedSha
  review.status = result
  review.reviewedSha = reviewedSha
  review.actionable = actionable
  review.resolvedAt = timestamp
  review.updatedAt = timestamp

  if (actionable && result === 'passed') {
    task.reviewedSha = reviewedSha
    task.status = 'review_passed'
  } else if (actionable && result === 'changes_requested') {
    task.reviewedSha = null
    task.status = 'fixing'
  }
  task.updatedAt = timestamp
  batch.updatedAt = timestamp
  batch.status = deriveBatchStatus(batch.tasks)
  return review
}

export function registerProject(state, input) {
  const rootPath = requiredString(input.rootPath, 'rootPath')
  const existing = state.projects.find((project) => project.rootPath === rootPath)
  if (existing) return existing

  const timestamp = now()
  const project = {
    id: input.id?.trim() || randomUUID(),
    name: requiredString(input.name, 'name'),
    rootPath,
    repository: typeof input.repository === 'string' && input.repository.trim() ? input.repository.trim() : null,
    taskLedger: input.taskLedger?.trim() || null,
    taskDir: input.taskDir?.trim() || null,
    integrationBranch: input.integrationBranch?.trim() || 'dev',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  state.projects.push(project)
  return project
}

export function createBatch(state, input) {
  const projectId = requiredString(input.projectId, 'projectId')
  if (!state.projects.some((project) => project.id === projectId)) throw new Error('projectId not found')
  if (!Array.isArray(input.tasks) || input.tasks.length === 0) throw new Error('tasks must not be empty')

  const timestamp = now()
  const seen = new Set()
  const tasks = input.tasks.map((task) => {
    const id = requiredString(task.id, 'task.id')
    if (seen.has(id)) throw new Error(`duplicate task id: ${id}`)
    seen.add(id)
    return {
      id,
      title: task.title?.trim() || id,
      status: 'waiting',
      builder: task.builder?.trim() || null,
      builderSessionId: null,
      reviewerSessionId: null,
      worktree: null,
      baseSha: task.baseSha?.trim() || null,
      currentSha: null,
      reviewedSha: null,
      reviewRound: 0,
      dependsOn: Array.isArray(task.dependsOn) ? task.dependsOn.filter(Boolean) : [],
      previewUrls: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    }
  })

  const batch = {
    id: nextBatchId(state, input.id),
    projectId,
    name: input.name?.trim() || `Batch ${state.batches.length + 1}`,
    status: 'planned',
    baseSha: input.baseSha?.trim() || null,
    tasks,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  state.batches.push(batch)
  return batch
}

export function updateTask(state, batchId, taskId, patch) {
  const batch = state.batches.find((item) => item.id === batchId)
  if (!batch) throw new Error('batch not found')
  const task = batch.tasks.find((item) => item.id === taskId)
  if (!task) throw new Error('task not found')

  if (patch.status === 'review_passed') throw new Error('review_passed is managed by review handoff')
  if (patch.reviewedSha !== undefined) throw new Error('reviewedSha is managed by review handoff')

  const currentShaChanged = patch.currentSha !== undefined && (patch.currentSha || null) !== task.currentSha
  let nextStatus = patch.status !== undefined ? patch.status : task.status
  let nextReviewedSha = task.reviewedSha
  if (currentShaChanged && task.reviewedSha && task.reviewedSha !== (patch.currentSha || null)) {
    nextReviewedSha = null
    if (patch.status === undefined && task.status === 'review_passed') nextStatus = 'stale'
  }
  if (!TASK_STATUSES.includes(nextStatus)) throw new Error(`invalid task status: ${nextStatus}`)

  const timestamp = now()
  task.status = nextStatus

  const scalarFields = ['builder', 'builderSessionId', 'reviewerSessionId', 'worktree', 'baseSha', 'currentSha']
  for (const field of scalarFields) {
    if (patch[field] !== undefined) task[field] = patch[field] || null
  }
  task.reviewedSha = nextReviewedSha

  if (currentShaChanged) {
    for (const review of reviews(state)) {
      if (review.batchId === batchId && review.taskId === taskId && review.status === 'passed' && review.actionable === true && review.requestedSha !== task.currentSha) {
        review.actionable = false
        review.invalidatedAt = timestamp
        review.updatedAt = timestamp
      }
    }
  }

  if (patch.reviewRound !== undefined) {
    if (!Number.isInteger(patch.reviewRound) || patch.reviewRound < 0) throw new Error('reviewRound must be a non-negative integer')
    task.reviewRound = patch.reviewRound
  }
  if (patch.previewUrls !== undefined) {
    if (!patch.previewUrls || typeof patch.previewUrls !== 'object' || Array.isArray(patch.previewUrls)) throw new Error('previewUrls must be an object')
    task.previewUrls = patch.previewUrls
  }

  task.updatedAt = timestamp
  batch.updatedAt = timestamp
  batch.status = deriveBatchStatus(batch.tasks)
  return task
}

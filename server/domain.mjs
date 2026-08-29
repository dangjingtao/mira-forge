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

function nextAdapterId(state, inputId) {
  const current = adapters(state)
  const explicitId = typeof inputId === 'string' ? inputId.trim() : ''
  if (explicitId) {
    if (current.some((adapter) => adapter.id === explicitId)) throw new Error(`duplicate adapter id: ${explicitId}`)
    return explicitId
  }

  let id
  do {
    id = randomUUID()
  } while (current.some((adapter) => adapter.id === id))
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

export function registerAdapter(state, input) {
  const kind = requiredString(input.kind, 'kind')
  if (!ADAPTER_KINDS.includes(kind)) throw new Error(`invalid adapter kind: ${kind}`)

  const status = input.status === undefined ? 'offline' : requiredString(input.status, 'status')
  if (!ADAPTER_STATUSES.includes(status)) throw new Error(`invalid adapter status: ${status}`)

  const timestamp = now()
  const adapter = {
    id: nextAdapterId(state, input.id),
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

function deriveBatchStatus(tasks) {
  if (tasks.every((task) => task.status === 'integrated')) return 'integrated'
  if (tasks.some((task) => task.status === 'interrupted' || task.status === 'stale')) return 'attention'
  if (tasks.some((task) => task.status === 'building' || task.status === 'fixing')) return 'active'
  if (tasks.some((task) => task.status === 'reviewing')) return 'reviewing'
  if (tasks.every((task) => ['review_passed', 'waiting_integration', 'integrated'].includes(task.status))) return 'waiting_integration'
  return 'planned'
}

export function updateTask(state, batchId, taskId, patch) {
  const batch = state.batches.find((item) => item.id === batchId)
  if (!batch) throw new Error('batch not found')
  const task = batch.tasks.find((item) => item.id === taskId)
  if (!task) throw new Error('task not found')

  const nextStatus = patch.status !== undefined ? patch.status : task.status
  if (!TASK_STATUSES.includes(nextStatus)) throw new Error(`invalid task status: ${nextStatus}`)

  const nextCurrentSha = patch.currentSha !== undefined ? patch.currentSha || null : task.currentSha
  const nextReviewedSha = patch.reviewedSha !== undefined ? patch.reviewedSha || null : task.reviewedSha
  if (nextStatus === 'review_passed') {
    if (!nextReviewedSha) throw new Error('reviewedSha is required for review_passed')
    if (!nextCurrentSha) throw new Error('currentSha is required for review_passed')
    if (nextReviewedSha !== nextCurrentSha) throw new Error('reviewedSha must match currentSha for review_passed')
  }

  task.status = nextStatus

  const scalarFields = ['builder', 'builderSessionId', 'worktree', 'baseSha', 'currentSha', 'reviewedSha']
  for (const field of scalarFields) {
    if (patch[field] !== undefined) task[field] = patch[field] || null
  }
  if (patch.reviewRound !== undefined) {
    if (!Number.isInteger(patch.reviewRound) || patch.reviewRound < 0) throw new Error('reviewRound must be a non-negative integer')
    task.reviewRound = patch.reviewRound
  }
  if (patch.previewUrls !== undefined) {
    if (!patch.previewUrls || typeof patch.previewUrls !== 'object' || Array.isArray(patch.previewUrls)) throw new Error('previewUrls must be an object')
    task.previewUrls = patch.previewUrls
  }

  const timestamp = now()
  task.updatedAt = timestamp
  batch.updatedAt = timestamp
  batch.status = deriveBatchStatus(batch.tasks)
  return task
}

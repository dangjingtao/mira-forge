const ACTIVE_SESSION_STATUSES = new Set(['starting', 'running', 'waiting'])
const ACTIVE_DISPATCH_STATUSES = new Set(['starting', 'running'])
const FAILED_DISPATCH_STATUSES = new Set(['failed', 'cancelled', 'interrupted'])
const ACTIVE_THREAD_STATUSES = new Set(['running'])
const UNRESOLVED_BUILDER_TASK_STATUSES = new Set(['interrupted', 'stale'])
const UNRESOLVED_REVIEW_TASK_STATUSES = new Set(['reviewing', 'fixing', 'interrupted', 'stale'])
const REVIEW_ATTENTION_STATUSES = new Set(['failed', 'changes_requested', 'cancelled'])
const PASSIVE_ROW_LIMIT = 16

function timeValue(value) {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : 0
}

function taskKey(batchId, taskId) {
  return `${batchId}:${taskId}`
}

function taskIndex(batches, projectId) {
  const index = new Map()
  for (const batch of batches) {
    if (batch.projectId !== projectId) continue
    for (const task of batch.tasks) index.set(taskKey(batch.id, task.id), { batch, task })
  }
  return index
}

function unsatisfiedDependencies(task, tasks) {
  const dependencies = Array.isArray(task.dependsOn) ? task.dependsOn : []
  const byId = new Map(tasks.map((item) => [item.id, item]))
  return dependencies.filter((id) => byId.get(id)?.status !== 'integrated')
}

function rowPriority(row) {
  if (row.active) return 0
  if (row.attention) return 1
  return 2
}

export function formatRuntimeDuration(startedAt, endedAt, now = Date.now()) {
  if (!startedAt) return 'not started'
  const start = timeValue(startedAt)
  if (!start) return 'unknown duration'
  const end = endedAt ? timeValue(endedAt) : now
  if (!end) return 'unknown duration'
  const seconds = Math.max(0, Math.floor((end - start) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

export function buildLiveRuntimeRows({ projectId, batches, dispatches, sessions, reviews, threads }) {
  if (!projectId) return []
  const tasks = taskIndex(batches, projectId)
  const rows = []

  for (const thread of threads.filter((item) => item.projectId === projectId)) {
    rows.push({
      id: `thread:${thread.id}`,
      kind: 'main',
      projectId,
      threadId: thread.id,
      sessionId: null,
      batchId: null,
      taskId: null,
      title: thread.title,
      provider: thread.adapter,
      status: thread.status,
      taskStatus: null,
      externalSessionId: thread.externalThreadId,
      startedAt: thread.createdAt,
      endedAt: null,
      updatedAt: thread.updatedAt,
      resultText: null,
      error: thread.lastError,
      detail: thread.externalThreadId ? `provider thread ${thread.externalThreadId}` : 'durable Forge Main Thread',
      active: ACTIVE_THREAD_STATUSES.has(thread.status),
      attention: thread.status === 'error',
    })
  }

  for (const session of sessions.filter((item) => item.projectId === projectId)) {
    const binding = tasks.get(taskKey(session.batchId, session.taskId))
    if (!binding) continue
    const dispatch = session.role === 'builder'
      ? dispatches.find((item) => item.sessionId === session.id)
      : null
    const review = session.role === 'reviewer'
      ? reviews.find((item) => item.reviewerSessionId === session.id)
      : null
    const status = dispatch?.status ?? review?.status ?? session.status
    const active = session.role === 'builder'
      ? ACTIVE_DISPATCH_STATUSES.has(status)
      : ACTIVE_SESSION_STATUSES.has(session.status)
    const attention = session.role === 'builder'
      ? FAILED_DISPATCH_STATUSES.has(status) && UNRESOLVED_BUILDER_TASK_STATUSES.has(binding.task.status)
      : REVIEW_ATTENTION_STATUSES.has(status) && UNRESOLVED_REVIEW_TASK_STATUSES.has(binding.task.status)

    rows.push({
      id: `session:${session.id}`,
      kind: session.role === 'builder' ? 'builder' : 'reviewer',
      projectId,
      threadId: dispatch?.sourceThreadId ?? null,
      sessionId: session.id,
      batchId: session.batchId,
      taskId: session.taskId,
      title: binding.task.title,
      provider: session.adapterId,
      status,
      taskStatus: binding.task.status,
      externalSessionId: session.externalSessionId ?? dispatch?.externalSessionId ?? null,
      startedAt: session.startedAt ?? null,
      endedAt: session.endedAt,
      updatedAt: dispatch?.updatedAt ?? review?.updatedAt ?? session.updatedAt,
      resultText: dispatch?.resultText ?? null,
      error: dispatch?.error ?? null,
      detail: dispatch
        ? `dispatch ${dispatch.id}`
        : review
          ? `review ${review.id} · round ${review.round}`
          : `${session.role} session`,
      active,
      attention,
    })
  }

  for (const batch of batches.filter((item) => item.projectId === projectId)) {
    const activeReviewerTasks = new Set(
      sessions
        .filter((session) => session.projectId === projectId
          && session.batchId === batch.id
          && session.role === 'reviewer'
          && ACTIVE_SESSION_STATUSES.has(session.status))
        .map((session) => session.taskId),
    )

    for (const task of batch.tasks) {
      const blockedBy = ['waiting', 'fixing'].includes(task.status)
        ? unsatisfiedDependencies(task, batch.tasks)
        : []
      if (blockedBy.length) {
        rows.push({
          id: `blocked:${batch.id}:${task.id}`,
          kind: 'task',
          projectId,
          threadId: null,
          sessionId: null,
          batchId: batch.id,
          taskId: task.id,
          title: task.title,
          provider: null,
          status: 'blocked',
          taskStatus: task.status,
          externalSessionId: null,
          startedAt: null,
          endedAt: null,
          updatedAt: batch.updatedAt ?? task.updatedAt ?? '',
          resultText: null,
          error: null,
          detail: `waiting for ${blockedBy.join(', ')}`,
          active: false,
          attention: true,
        })
      }

      if (task.status === 'reviewing' && !activeReviewerTasks.has(task.id)) {
        rows.push({
          id: `review-needed:${batch.id}:${task.id}`,
          kind: 'task',
          projectId,
          threadId: null,
          sessionId: null,
          batchId: batch.id,
          taskId: task.id,
          title: task.title,
          provider: task.builder ?? null,
          status: 'review_needed',
          taskStatus: task.status,
          externalSessionId: null,
          startedAt: null,
          endedAt: null,
          updatedAt: task.updatedAt ?? batch.updatedAt ?? '',
          resultText: null,
          error: null,
          detail: 'Builder finished; review is still required',
          active: false,
          attention: true,
        })
      }
    }
  }

  rows.sort((left, right) => {
    const priority = rowPriority(left) - rowPriority(right)
    if (priority) return priority
    return timeValue(right.updatedAt) - timeValue(left.updatedAt)
  })

  const actionable = rows.filter((row) => row.active || row.attention)
  const passive = rows
    .filter((row) => !row.active && !row.attention)
    .slice(0, Math.max(0, PASSIVE_ROW_LIMIT - actionable.length))
  return [...actionable, ...passive]
}

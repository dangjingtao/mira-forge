import { createBatch } from './domain.mjs'
import { inspectRepositoryTaskSource, resolveRepositoryTask } from './repo-task-source.mjs'
import { validateBatchDependencies } from './readiness.mjs'

const DEFAULT_TASK_LEDGER = 'docs/workbench/00-work-ledger.md'
const DEFAULT_TASK_DIR = 'docs/workbench/tasks'

function requiredString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`)
  return value.trim()
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function projectForId(state, projectId) {
  const id = requiredString(projectId, 'projectId')
  const project = state.projects.find((item) => item.id === id)
  if (!project) throw new Error('projectId not found')
  return project
}

export function withTaskSourceDefaults(project) {
  return {
    ...project,
    taskLedger: optionalString(project?.taskLedger) || DEFAULT_TASK_LEDGER,
    taskDir: optionalString(project?.taskDir) || DEFAULT_TASK_DIR,
  }
}

function taskIdList(value) {
  if (!Array.isArray(value) || value.length === 0) throw new Error('taskIds must not be empty')
  const ids = value.map((item) => requiredString(item, 'taskId'))
  if (new Set(ids).size !== ids.length) throw new Error('taskIds must be unique')
  return ids
}

export async function inspectProjectTaskSource(store, projectId) {
  const state = await store.read()
  return inspectRepositoryTaskSource(withTaskSourceDefaults(projectForId(state, projectId)))
}

export async function resolveProjectTask(store, projectId, taskId) {
  const state = await store.read()
  return resolveRepositoryTask(
    withTaskSourceDefaults(projectForId(state, projectId)),
    requiredString(taskId, 'taskId'),
  )
}

export async function configureProjectTaskSource(store, projectId, input) {
  const snapshot = await store.read()
  const project = projectForId(snapshot, projectId)
  const taskLedger = optionalString(input?.taskLedger) || optionalString(project.taskLedger) || DEFAULT_TASK_LEDGER
  const taskDir = optionalString(input?.taskDir) || optionalString(project.taskDir) || DEFAULT_TASK_DIR
  const candidate = { ...project, taskLedger, taskDir }

  // Validate the repository paths and ledger/card contract before persisting them.
  const source = await inspectRepositoryTaskSource(candidate)
  const updated = await store.mutate((state) => {
    const current = projectForId(state, projectId)
    current.taskLedger = taskLedger
    current.taskDir = taskDir
    current.updatedAt = new Date().toISOString()
    return { ...current }
  })

  return { project: updated, source }
}

export async function createProjectBatch(store, projectId, input) {
  const ids = taskIdList(input?.taskIds)
  const snapshot = await store.read()
  const project = withTaskSourceDefaults(projectForId(snapshot, projectId))
  const source = await inspectRepositoryTaskSource(project)
  const byId = new Map(source.tasks.map((task) => [task.id, task]))

  for (const id of ids) {
    if (!byId.has(id)) throw new Error(`task ${id} is not present in repository ledger`)
  }

  return store.mutate((state) => {
    projectForId(state, projectId)
    const duplicate = state.batches
      .filter((batch) => batch.projectId === projectId && batch.status !== 'integrated')
      .flatMap((batch) => batch.tasks)
      .find((task) => ids.includes(task.id) && task.status !== 'integrated')
    if (duplicate) throw new Error(`task ${duplicate.id} already exists in an active batch`)

    const created = createBatch(state, {
      projectId,
      name: typeof input?.name === 'string' ? input.name : undefined,
      tasks: ids.map((id) => {
        const task = byId.get(id)
        return { id: task.id, title: task.title }
      }),
    })
    validateBatchDependencies(created)
    return created
  })
}

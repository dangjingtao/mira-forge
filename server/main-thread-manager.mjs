import {
  appendMainThreadEvent,
  beginMainThreadTurn,
  completeMainThreadTurn,
  createMainThread,
  createMainThreadHandoff,
  failMainThreadTurn,
  findMainThread,
  getMainThreadEvents,
  getMainThreads,
  reconcileMainThreads,
} from './main-thread-domain.mjs'
import {
  createRepositoryTask,
  inspectRepositoryTaskSource,
  resolveRepositoryTask,
  updateRepositoryTask,
} from './repo-task-source.mjs'
import { withTaskSourceDefaults } from './project-task-actions.mjs'

function requiredString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`)
  return value.trim()
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function projectForThread(state, thread) {
  const project = state.projects.find((item) => item.id === thread.projectId)
  if (!project) throw new Error('thread project not found')
  return project
}

function threadSnapshot(state, threadId) {
  const thread = findMainThread(state, threadId)
  return {
    thread,
    events: getMainThreadEvents(state, thread.id),
  }
}

export function buildMainThreadPrompt({ project, taskSource, taskSourceError, message }) {
  const taskLines = taskSource?.tasks?.slice(0, 80).map((task) =>
    `- ${task.id} [${task.status}] ${task.title}`) ?? []
  const omitted = taskSource?.tasks?.length > taskLines.length
    ? `- ... ${taskSource.tasks.length - taskLines.length} more task(s) omitted`
    : null

  return [
    '# Mira Forge Main Thread',
    '',
    'You are the project main/dispatch thread. Discuss, inspect and plan. You are not a Builder.',
    'Do not modify project files or dispatch a Builder directly. Use read-only inspection only.',
    'Repository Task Cards are authoritative. When a Task Card write or dispatch handoff is needed, describe the requested Forge capability action; Forge performs it only through an explicit action.',
    '',
    '## Project',
    `Name: ${project.name}`,
    `Root: ${project.rootPath}`,
    `Integration branch: ${project.integrationBranch}`,
    project.repository ? `Repository: ${project.repository}` : null,
    '',
    '## Repository Task Source',
    taskSource
      ? `Ledger: ${taskSource.ledgerRef} · Task dir: ${taskSource.taskDirRef}`
      : `Unavailable: ${taskSourceError || 'project has no configured repository task source'}`,
    ...taskLines,
    omitted,
    '',
    '## User',
    requiredString(message, 'message'),
  ].filter((line) => line !== null).join('\n')
}

export function createMainThreadManager({ store, adapters }) {
  if (!store?.read || !store?.mutate) throw new Error('store is required')
  if (!(adapters instanceof Map)) throw new Error('adapters must be a Map')

  async function listThreads(projectId = null) {
    const state = await store.read()
    return getMainThreads(state, projectId)
  }

  async function getThread(threadId) {
    return threadSnapshot(await store.read(), threadId)
  }

  async function openThread(input) {
    const adapterId = requiredString(input?.adapter, 'adapter')
    if (!adapters.has(adapterId)) throw new Error(`main thread adapter is unavailable: ${adapterId}`)
    return store.mutate((state) => createMainThread(state, input))
  }

  async function sendMessage(threadId, input) {
    const message = requiredString(input?.message, 'message')
    const startedThread = await store.mutate((state) => {
      const thread = beginMainThreadTurn(state, threadId, message)
      return { ...thread }
    })

    try {
      const state = await store.read()
      const thread = findMainThread(state, startedThread.id)
      const project = projectForThread(state, thread)
      const taskProject = withTaskSourceDefaults(project)
      const adapter = adapters.get(thread.adapter)
      if (!adapter?.runTurn) throw new Error(`main thread adapter is unavailable: ${thread.adapter}`)

      let taskSource = null
      let taskSourceError = null
      try {
        taskSource = await inspectRepositoryTaskSource(taskProject)
      } catch (error) {
        taskSourceError = error instanceof Error ? error.message : String(error)
      }

      const prompt = buildMainThreadPrompt({
        project,
        taskSource,
        taskSourceError,
        message,
      })
      const result = await adapter.runTurn({
        projectRoot: project.rootPath,
        message: prompt,
        externalThreadId: thread.externalThreadId,
        model: optionalString(input?.model) || thread.model,
        onEvent: async (event) => {
          await store.mutate((nextState) => appendMainThreadEvent(nextState, thread.id, event))
        },
      })

      await store.mutate((nextState) => completeMainThreadTurn(nextState, thread.id, result))
      return getThread(thread.id)
    } catch (error) {
      await store.mutate((state) => failMainThreadTurn(state, startedThread.id, error))
      throw error
    }
  }

  async function inspectTasks(threadId) {
    const state = await store.read()
    const thread = findMainThread(state, threadId)
    const project = withTaskSourceDefaults(projectForThread(state, thread))
    const source = await inspectRepositoryTaskSource(project)
    await store.mutate((nextState) => {
      appendMainThreadEvent(nextState, thread.id, {
        type: 'tool',
        tool: { name: 'task-source.inspect', status: 'completed' },
        text: `${source.tasks.length} repository task(s)`,
      })
    })
    return source
  }

  async function resolveTask(threadId, taskId) {
    const state = await store.read()
    const thread = findMainThread(state, threadId)
    const project = withTaskSourceDefaults(projectForThread(state, thread))
    const task = await resolveRepositoryTask(project, taskId)
    await store.mutate((nextState) => {
      appendMainThreadEvent(nextState, thread.id, {
        type: 'artifact',
        text: `resolved ${task.id}`,
        artifact: { kind: 'task-card-ref', ref: task.taskRef },
      })
    })
    return task
  }

  async function createTask(threadId, input) {
    const state = await store.read()
    const thread = findMainThread(state, threadId)
    const project = withTaskSourceDefaults(projectForThread(state, thread))
    const task = await createRepositoryTask(project, input)
    await store.mutate((nextState) => {
      appendMainThreadEvent(nextState, thread.id, {
        type: 'tool',
        tool: { name: 'task-source.create', status: 'completed' },
        text: task.id,
      })
      appendMainThreadEvent(nextState, thread.id, {
        type: 'artifact',
        text: `created ${task.id}`,
        artifact: { kind: 'task-card-ref', ref: task.taskRef },
      })
    })
    return task
  }

  async function updateTask(threadId, taskId, patch) {
    const state = await store.read()
    const thread = findMainThread(state, threadId)
    const project = withTaskSourceDefaults(projectForThread(state, thread))
    const task = await updateRepositoryTask(project, taskId, patch)
    await store.mutate((nextState) => {
      appendMainThreadEvent(nextState, thread.id, {
        type: 'tool',
        tool: { name: 'task-source.update', status: 'completed' },
        text: task.id,
      })
      appendMainThreadEvent(nextState, thread.id, {
        type: 'artifact',
        text: `updated ${task.id}`,
        artifact: { kind: 'task-card-ref', ref: task.taskRef },
      })
    })
    return task
  }

  async function createHandoff(threadId, input) {
    const state = await store.read()
    const thread = findMainThread(state, threadId)
    const project = withTaskSourceDefaults(projectForThread(state, thread))
    const taskId = requiredString(input?.taskId, 'taskId')
    const preferredBuilder = requiredString(input?.preferredBuilder, 'preferredBuilder')
    const task = await resolveRepositoryTask(project, taskId)
    const requestedRef = optionalString(input?.taskRef)
    if (requestedRef && requestedRef !== task.taskRef) {
      throw new Error(`handoff taskRef does not match repository task reference: ${task.taskRef}`)
    }

    return store.mutate((nextState) => createMainThreadHandoff(nextState, thread.id, {
      projectId: project.id,
      taskId: task.id,
      taskRef: task.taskRef,
      preferredBuilder,
    }))
  }

  async function reconcile() {
    return store.mutate((state) => reconcileMainThreads(state))
  }

  return {
    listThreads,
    getThread,
    openThread,
    sendMessage,
    inspectTasks,
    resolveTask,
    createTask,
    updateTask,
    createHandoff,
    reconcile,
  }
}

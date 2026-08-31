import { createReadStream } from 'node:fs'
import { access, readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createOpenCodeAcceptance } from './acceptance.mjs'
import {
  BUILDER_CHOICES,
  BUILTIN_BUILDER_ADAPTER_IDS,
  CODEX_ADAPTER_ID,
  OPENCODE_ADAPTER_ID,
  PIAGENT_ADAPTER_ID,
} from './builder-contract.mjs'
import { createCodexBuilderRunner, parseCodexBuilderPrefixArgs } from './codex-builder-adapter.mjs'
import { createCodexDesktopMainThreadAdapter } from './codex-desktop-adapter.mjs'
import {
  ADAPTER_KINDS,
  ADAPTER_STATUSES,
  createBatch,
  createReviewHandoff,
  createSession,
  heartbeatAdapter,
  registerAdapter,
  registerProject,
  resolveReviewHandoff,
  REVIEW_STATUSES,
  SESSION_ROLES,
  SESSION_STATUSES,
  TASK_STATUSES,
  updateSession,
  updateTask,
} from './domain.mjs'
import { DISPATCH_STATUSES, getDispatches, getRuntimeEvents } from './dispatch-domain.mjs'
import { createDispatchManager } from './dispatch-manager.mjs'
import {
  createCodexMainThreadAdapter,
  createOpenCodeMainThreadAdapter,
  parseMainThreadPrefixArgs,
} from './main-thread-adapters.mjs'
import {
  MAIN_THREAD_ADAPTERS,
  MAIN_THREAD_EVENT_TYPES,
  MAIN_THREAD_STATUSES,
} from './main-thread-domain.mjs'
import { createMainThreadManager } from './main-thread-manager.mjs'
import { createOpenCodeRunner, parseOpenCodePrefixArgs } from './opencode-adapter.mjs'
import { createPiAgentRunner, parsePiAgentPrefixArgs } from './piagent-adapter.mjs'
import {
  configureProjectTaskSource,
  createProjectBatch,
  inspectProjectTaskSource,
  resolveProjectTask,
} from './project-task-actions.mjs'
import { DISPATCHABLE_TASK_STATUSES, getDispatchReadiness, validateBatchDependencies } from './readiness.mjs'
import { createStore } from './store.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(here, '..')
const distDir = join(rootDir, 'dist')
const host = process.env.MIRA_FORGE_HOST || '127.0.0.1'
const port = Number(process.env.MIRA_FORGE_PORT || 47831)
const stateFile = process.env.MIRA_FORGE_STATE_FILE || join(homedir(), '.mira-forge', 'state.json')
const store = createStore(stateFile)
const openCodeRunner = createOpenCodeRunner({
  bin: process.env.MIRA_FORGE_OPENCODE_BIN || 'opencode',
  prefixArgs: parseOpenCodePrefixArgs(process.env.MIRA_FORGE_OPENCODE_PREFIX_ARGS),
})
const piAgentRunner = createPiAgentRunner({
  bin: process.env.MIRA_FORGE_PIAGENT_BIN || 'pi',
  prefixArgs: parsePiAgentPrefixArgs(process.env.MIRA_FORGE_PIAGENT_PREFIX_ARGS),
})
const codexBuilderRunner = createCodexBuilderRunner({
  bin: process.env.MIRA_FORGE_CODEX_DESKTOP_BUILDER_BIN || process.env.MIRA_FORGE_CODEX_DESKTOP_BIN || null,
  prefixArgs: parseCodexBuilderPrefixArgs(process.env.MIRA_FORGE_CODEX_BUILDER_PREFIX_ARGS),
})
const dispatchManager = createDispatchManager({
  store,
  runners: new Map([
    [OPENCODE_ADAPTER_ID, openCodeRunner],
    [PIAGENT_ADAPTER_ID, piAgentRunner],
    [CODEX_ADAPTER_ID, codexBuilderRunner],
  ]),
})
const openCodeAcceptance = createOpenCodeAcceptance({
  runner: openCodeRunner,
  timeoutMs: Number(process.env.MIRA_FORGE_ACCEPTANCE_TIMEOUT_MS || 120_000),
})
const mainThreadTimeoutMs = Number(process.env.MIRA_FORGE_MAIN_THREAD_TIMEOUT_MS || 300_000)
const mainThreadManager = createMainThreadManager({
  store,
  adapters: new Map([
    ['opencode', createOpenCodeMainThreadAdapter({
      bin: process.env.MIRA_FORGE_OPENCODE_BIN || 'opencode',
      prefixArgs: parseMainThreadPrefixArgs(
        process.env.MIRA_FORGE_OPENCODE_THREAD_PREFIX_ARGS ?? process.env.MIRA_FORGE_OPENCODE_PREFIX_ARGS,
        'OpenCode main thread prefix args',
      ),
      timeoutMs: mainThreadTimeoutMs,
    })],
    ['codex-desktop', createCodexDesktopMainThreadAdapter({
      bin: process.env.MIRA_FORGE_CODEX_DESKTOP_BIN || null,
      prefixArgs: parseMainThreadPrefixArgs(
        process.env.MIRA_FORGE_CODEX_DESKTOP_PREFIX_ARGS,
        'Codex Desktop app-server prefix args',
      ),
      timeoutMs: mainThreadTimeoutMs,
    })],
    ['codex', createCodexMainThreadAdapter({
      bin: process.env.MIRA_FORGE_CODEX_BIN || 'codex',
      prefixArgs: parseMainThreadPrefixArgs(
        process.env.MIRA_FORGE_CODEX_PREFIX_ARGS,
        'Codex main thread prefix args',
      ),
      timeoutMs: mainThreadTimeoutMs,
    })],
  ]),
})

function sendJson(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(payload))
}

async function readJson(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 1024 * 1024) throw new Error('request body too large')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function contentType(path) {
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8',
  })[extname(path)] || 'application/octet-stream'
}

async function serveStatic(requestPath, response) {
  try {
    await access(distDir)
  } catch {
    return false
  }

  const normalized = requestPath === '/' ? '/index.html' : requestPath
  const candidate = resolve(distDir, `.${normalized}`)
  if (!candidate.startsWith(distDir)) return false

  try {
    const info = await stat(candidate)
    if (info.isFile()) {
      response.writeHead(200, { 'content-type': contentType(candidate) })
      createReadStream(candidate).pipe(response)
      return true
    }
  } catch {
    // SPA fallback below.
  }

  const indexPath = join(distDir, 'index.html')
  try {
    const html = await readFile(indexPath)
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(html)
    return true
  } catch {
    return false
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${host}:${port}`)

    if (request.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(response, 200, { ok: true, service: 'mira-forge', version: '0.1.0', stateFile })
    }
    if (request.method === 'GET' && url.pathname === '/api/state') {
      return sendJson(response, 200, await store.read())
    }
    if (request.method === 'GET' && url.pathname === '/api/projects') {
      return sendJson(response, 200, (await store.read()).projects)
    }
    if (request.method === 'GET' && url.pathname === '/api/batches') {
      return sendJson(response, 200, (await store.read()).batches)
    }
    if (request.method === 'GET' && url.pathname === '/api/adapters') {
      return sendJson(response, 200, (await store.read()).adapters)
    }
    if (request.method === 'GET' && url.pathname === '/api/sessions') {
      return sendJson(response, 200, (await store.read()).sessions)
    }
    if (request.method === 'GET' && url.pathname === '/api/reviews') {
      return sendJson(response, 200, (await store.read()).reviews)
    }
    if (request.method === 'GET' && url.pathname === '/api/dispatches') {
      return sendJson(response, 200, getDispatches(await store.read()))
    }
    if (request.method === 'GET' && url.pathname === '/api/events') {
      let events = getRuntimeEvents(await store.read())
      for (const key of ['projectId', 'batchId', 'taskId', 'dispatchId']) {
        const value = url.searchParams.get(key)
        if (value) events = events.filter((event) => event[key] === value)
      }
      return sendJson(response, 200, events)
    }
    if (request.method === 'GET' && url.pathname === '/api/threads') {
      return sendJson(response, 200, await mainThreadManager.listThreads(url.searchParams.get('projectId')))
    }
    if (request.method === 'GET' && url.pathname === '/api/meta') {
      return sendJson(response, 200, {
        taskStatuses: TASK_STATUSES,
        adapterKinds: ADAPTER_KINDS,
        adapterStatuses: ADAPTER_STATUSES,
        sessionRoles: SESSION_ROLES,
        sessionStatuses: SESSION_STATUSES,
        reviewStatuses: REVIEW_STATUSES,
        dispatchStatuses: DISPATCH_STATUSES,
        dispatchableTaskStatuses: DISPATCHABLE_TASK_STATUSES,
        builderChoices: BUILDER_CHOICES,
        builtinBuilderAdapters: BUILTIN_BUILDER_ADAPTER_IDS,
        mainThreadAdapters: MAIN_THREAD_ADAPTERS,
        mainThreadStatuses: MAIN_THREAD_STATUSES,
        mainThreadEventTypes: MAIN_THREAD_EVENT_TYPES,
        firstRunChecks: ['opencode'],
      })
    }
    if (request.method === 'POST' && url.pathname === '/api/acceptance/opencode') {
      return sendJson(response, 200, await openCodeAcceptance.run())
    }
    if (request.method === 'POST' && url.pathname === '/api/projects') {
      const body = await readJson(request)
      const project = await store.mutate((state) => registerProject(state, body))
      return sendJson(response, 201, project)
    }
    if (request.method === 'POST' && url.pathname === '/api/batches') {
      const body = await readJson(request)
      const batch = await store.mutate((state) => {
        const created = createBatch(state, body)
        validateBatchDependencies(created)
        return created
      })
      return sendJson(response, 201, batch)
    }
    if (request.method === 'POST' && url.pathname === '/api/adapters') {
      const body = await readJson(request)
      const adapter = await store.mutate((state) => registerAdapter(state, body))
      return sendJson(response, 201, adapter)
    }
    if (request.method === 'POST' && url.pathname === '/api/sessions') {
      const body = await readJson(request)
      const session = await store.mutate((state) => createSession(state, body))
      return sendJson(response, 201, session)
    }
    if (request.method === 'POST' && url.pathname === '/api/reviews') {
      const body = await readJson(request)
      const review = await store.mutate((state) => createReviewHandoff(state, body))
      return sendJson(response, 201, review)
    }
    if (request.method === 'POST' && url.pathname === '/api/threads') {
      const body = await readJson(request)
      return sendJson(response, 201, await mainThreadManager.openThread(body))
    }

    const projectTaskSourceMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/task-source$/)
    if (projectTaskSourceMatch) {
      const [, rawProjectId] = projectTaskSourceMatch
      const projectId = decodeURIComponent(rawProjectId)
      if (request.method === 'GET') {
        return sendJson(response, 200, await inspectProjectTaskSource(store, projectId))
      }
      if (request.method === 'PATCH') {
        const body = await readJson(request)
        return sendJson(response, 200, await configureProjectTaskSource(store, projectId, body))
      }
    }

    const projectTaskCollectionMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/)
    if (request.method === 'GET' && projectTaskCollectionMatch) {
      const [, rawProjectId] = projectTaskCollectionMatch
      return sendJson(response, 200, await inspectProjectTaskSource(store, decodeURIComponent(rawProjectId)))
    }

    const projectTaskMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)$/)
    if (request.method === 'GET' && projectTaskMatch) {
      const [, rawProjectId, rawTaskId] = projectTaskMatch
      return sendJson(response, 200, await resolveProjectTask(
        store,
        decodeURIComponent(rawProjectId),
        decodeURIComponent(rawTaskId),
      ))
    }

    const projectBatchCollectionMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/batches$/)
    if (request.method === 'POST' && projectBatchCollectionMatch) {
      const [, rawProjectId] = projectBatchCollectionMatch
      const body = await readJson(request)
      return sendJson(response, 201, await createProjectBatch(store, decodeURIComponent(rawProjectId), body))
    }

    const heartbeatMatch = url.pathname.match(/^\/api\/adapters\/([^/]+)\/heartbeat$/)
    if (request.method === 'POST' && heartbeatMatch) {
      const [, rawAdapterId] = heartbeatMatch
      const body = await readJson(request)
      const adapter = await store.mutate((state) => heartbeatAdapter(state, decodeURIComponent(rawAdapterId), body))
      return sendJson(response, 200, adapter)
    }

    const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/)
    if (request.method === 'PATCH' && sessionMatch) {
      const [, rawSessionId] = sessionMatch
      const body = await readJson(request)
      const session = await store.mutate((state) => updateSession(state, decodeURIComponent(rawSessionId), body))
      return sendJson(response, 200, session)
    }

    const reviewResultMatch = url.pathname.match(/^\/api\/reviews\/([^/]+)\/result$/)
    if (request.method === 'POST' && reviewResultMatch) {
      const [, rawReviewId] = reviewResultMatch
      const body = await readJson(request)
      const review = await store.mutate((state) => resolveReviewHandoff(state, decodeURIComponent(rawReviewId), body))
      return sendJson(response, 200, review)
    }

    const threadMessageMatch = url.pathname.match(/^\/api\/threads\/([^/]+)\/messages$/)
    if (request.method === 'POST' && threadMessageMatch) {
      const [, rawThreadId] = threadMessageMatch
      const body = await readJson(request)
      return sendJson(response, 200, await mainThreadManager.sendMessage(decodeURIComponent(rawThreadId), body))
    }

    const threadTaskCollectionMatch = url.pathname.match(/^\/api\/threads\/([^/]+)\/tasks$/)
    if (threadTaskCollectionMatch) {
      const [, rawThreadId] = threadTaskCollectionMatch
      const threadId = decodeURIComponent(rawThreadId)
      if (request.method === 'GET') {
        return sendJson(response, 200, await mainThreadManager.inspectTasks(threadId))
      }
      if (request.method === 'POST') {
        const body = await readJson(request)
        return sendJson(response, 201, await mainThreadManager.createTask(threadId, body))
      }
    }

    const threadTaskMatch = url.pathname.match(/^\/api\/threads\/([^/]+)\/tasks\/([^/]+)$/)
    if (threadTaskMatch) {
      const [, rawThreadId, rawTaskId] = threadTaskMatch
      const threadId = decodeURIComponent(rawThreadId)
      const taskId = decodeURIComponent(rawTaskId)
      if (request.method === 'GET') {
        return sendJson(response, 200, await mainThreadManager.resolveTask(threadId, taskId))
      }
      if (request.method === 'PATCH') {
        const body = await readJson(request)
        return sendJson(response, 200, await mainThreadManager.updateTask(threadId, taskId, body))
      }
    }

    const threadHandoffMatch = url.pathname.match(/^\/api\/threads\/([^/]+)\/handoffs$/)
    if (request.method === 'POST' && threadHandoffMatch) {
      const [, rawThreadId] = threadHandoffMatch
      const body = await readJson(request)
      return sendJson(response, 201, await mainThreadManager.createHandoff(decodeURIComponent(rawThreadId), body))
    }

    const threadMatch = url.pathname.match(/^\/api\/threads\/([^/]+)$/)
    if (request.method === 'GET' && threadMatch) {
      const [, rawThreadId] = threadMatch
      return sendJson(response, 200, await mainThreadManager.getThread(decodeURIComponent(rawThreadId)))
    }

    const dispatchTaskMatch = url.pathname.match(/^\/api\/batches\/([^/]+)\/tasks\/([^/]+)\/dispatch$/)
    if (request.method === 'POST' && dispatchTaskMatch) {
      const [, rawBatchId, rawTaskId] = dispatchTaskMatch
      const body = await readJson(request)
      const dispatch = await dispatchManager.dispatchTask({
        ...body,
        batchId: decodeURIComponent(rawBatchId),
        taskId: decodeURIComponent(rawTaskId),
      })
      return sendJson(response, 202, dispatch)
    }

    const dispatchCancelMatch = url.pathname.match(/^\/api\/dispatches\/([^/]+)\/cancel$/)
    if (request.method === 'POST' && dispatchCancelMatch) {
      const [, rawDispatchId] = dispatchCancelMatch
      const dispatch = await dispatchManager.cancelDispatch(decodeURIComponent(rawDispatchId))
      return sendJson(response, 200, dispatch)
    }

    const dispatchMatch = url.pathname.match(/^\/api\/batches\/([^/]+)\/dispatch-ready$/)
    if (request.method === 'GET' && dispatchMatch) {
      const [, rawBatchId] = dispatchMatch
      const readiness = getDispatchReadiness(await store.read(), decodeURIComponent(rawBatchId))
      return sendJson(response, 200, readiness)
    }

    const taskMatch = url.pathname.match(/^\/api\/batches\/([^/]+)\/tasks\/([^/]+)$/)
    if (request.method === 'PATCH' && taskMatch) {
      const [, rawBatchId, rawTaskId] = taskMatch
      const body = await readJson(request)
      const task = await store.mutate((state) => updateTask(state, decodeURIComponent(rawBatchId), decodeURIComponent(rawTaskId), body))
      return sendJson(response, 200, task)
    }

    if (url.pathname.startsWith('/api/')) return sendJson(response, 404, { error: 'not_found' })
    if (await serveStatic(url.pathname, response)) return

    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Mira Forge dashboard is not built. Run npm run dev or npm run build.')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    sendJson(response, 400, { error: 'bad_request', message })
  }
})

await dispatchManager.reconcile()
await mainThreadManager.reconcile()

server.listen(port, host, () => {
  console.log(`Mira Forge control plane: http://${host}:${port}`)
  console.log(`State: ${stateFile}`)
})

let shuttingDown = false
async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  try {
    await dispatchManager.shutdown()
  } finally {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 1500).unref()
  }
}

process.once('SIGINT', () => { void shutdown() })
process.once('SIGTERM', () => { void shutdown() })

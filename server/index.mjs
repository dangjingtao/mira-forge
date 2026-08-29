import { createReadStream } from 'node:fs'
import { access, readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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
import { DISPATCHABLE_TASK_STATUSES, getDispatchReadiness, validateBatchDependencies } from './readiness.mjs'
import { createStore } from './store.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(here, '..')
const distDir = join(rootDir, 'dist')
const host = process.env.MIRA_FORGE_HOST || '127.0.0.1'
const port = Number(process.env.MIRA_FORGE_PORT || 47831)
const stateFile = process.env.MIRA_FORGE_STATE_FILE || join(homedir(), '.mira-forge', 'state.json')
const store = createStore(stateFile)

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
    if (request.method === 'GET' && url.pathname === '/api/meta') {
      return sendJson(response, 200, {
        taskStatuses: TASK_STATUSES,
        adapterKinds: ADAPTER_KINDS,
        adapterStatuses: ADAPTER_STATUSES,
        sessionRoles: SESSION_ROLES,
        sessionStatuses: SESSION_STATUSES,
        reviewStatuses: REVIEW_STATUSES,
        dispatchableTaskStatuses: DISPATCHABLE_TASK_STATUSES,
      })
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

server.listen(port, host, () => {
  console.log(`Mira Forge control plane: http://${host}:${port}`)
  console.log(`State: ${stateFile}`)
})

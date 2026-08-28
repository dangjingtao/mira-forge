import { createReadStream } from 'node:fs'
import { access, readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createBatch, registerProject, TASK_STATUSES, updateTask } from './domain.mjs'
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
  const url = new URL(request.url || '/', `http://${request.headers.host || `${host}:${port}`}`)

  try {
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
    if (request.method === 'GET' && url.pathname === '/api/meta') {
      return sendJson(response, 200, { taskStatuses: TASK_STATUSES })
    }
    if (request.method === 'POST' && url.pathname === '/api/projects') {
      const body = await readJson(request)
      const project = await store.mutate((state) => registerProject(state, body))
      return sendJson(response, 201, project)
    }
    if (request.method === 'POST' && url.pathname === '/api/batches') {
      const body = await readJson(request)
      const batch = await store.mutate((state) => createBatch(state, body))
      return sendJson(response, 201, batch)
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

import { once } from 'node:events'
import { mkdtemp } from 'node:fs/promises'
import { createConnection, createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

const rootDir = resolve(import.meta.dirname, '..')
const tempDir = await mkdtemp(join(tmpdir(), 'mira-forge-smoke-'))
const stateFile = join(tempDir, 'state.json')

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

async function reservePort() {
  const probe = createServer()
  await new Promise((resolvePromise, reject) => {
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', resolvePromise)
  })
  const address = probe.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise((resolvePromise) => probe.close(resolvePromise))
  return port
}

async function probeMalformedHost(port) {
  await new Promise((resolvePromise) => {
    const socket = createConnection({ host: '127.0.0.1', port }, () => {
      socket.end('GET /api/health HTTP/1.1\r\nHost: [\r\nConnection: close\r\n\r\n')
    })
    socket.resume()
    socket.setTimeout(1000, () => socket.destroy())
    socket.on('error', () => resolvePromise())
    socket.on('close', () => resolvePromise())
  })
}

async function json(response) {
  const body = await response.json()
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body)}`)
  return body
}

const port = await reservePort()
const baseUrl = `http://127.0.0.1:${port}`
const child = spawn(process.execPath, ['server/index.mjs'], {
  cwd: rootDir,
  env: {
    ...process.env,
    MIRA_FORGE_PORT: String(port),
    MIRA_FORGE_STATE_FILE: stateFile,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let logs = ''
child.stdout.on('data', (chunk) => { logs += chunk.toString() })
child.stderr.on('data', (chunk) => { logs += chunk.toString() })

try {
  let healthy = false
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`)
      if (response.ok) {
        healthy = true
        break
      }
    } catch {
      // Service may still be starting.
    }
    await sleep(100)
  }
  if (!healthy) throw new Error(`Forge did not become healthy.\n${logs}`)

  await probeMalformedHost(port)
  await sleep(50)
  const healthAfterMalformedHost = await fetch(`${baseUrl}/api/health`)
  if (!healthAfterMalformedHost.ok) throw new Error('Malformed Host request took the control plane offline')

  const builder = await json(await fetch(`${baseUrl}/api/adapters`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'smoke-builder', name: 'Smoke Builder', kind: 'builder', capabilities: ['code', 'terminal'] }),
  }))
  const reviewer = await json(await fetch(`${baseUrl}/api/adapters`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'smoke-reviewer', name: 'Smoke Reviewer', kind: 'reviewer', capabilities: ['review'] }),
  }))
  await json(await fetch(`${baseUrl}/api/adapters/${builder.id}/heartbeat`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'available' }),
  }))
  await json(await fetch(`${baseUrl}/api/adapters/${reviewer.id}/heartbeat`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'available' }),
  }))

  const project = await json(await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Smoke Project', rootPath: tempDir, integrationBranch: 'dev' }),
  }))

  const batch = await json(await fetch(`${baseUrl}/api/batches`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: project.id, name: 'Smoke Batch', tasks: [{ id: 'T001', title: 'Smoke task' }] }),
  }))

  const builderSession = await json(await fetch(`${baseUrl}/api/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 'S-smoke-builder', role: 'builder', adapterId: builder.id, projectId: project.id, batchId: batch.id, taskId: 'T001',
    }),
  }))
  await json(await fetch(`${baseUrl}/api/sessions/${builderSession.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'running' }),
  }))

  const builtTask = await json(await fetch(`${baseUrl}/api/batches/${batch.id}/tasks/T001`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'building', builder: builder.id, currentSha: 'smoke-sha' }),
  }))
  if (builtTask.currentSha !== 'smoke-sha' || builtTask.builderSessionId !== builderSession.id) {
    throw new Error('Builder task binding did not persist')
  }
  await json(await fetch(`${baseUrl}/api/sessions/${builderSession.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'completed' }),
  }))

  const reviewerSession = await json(await fetch(`${baseUrl}/api/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 'S-smoke-reviewer', role: 'reviewer', adapterId: reviewer.id, projectId: project.id, batchId: batch.id, taskId: 'T001',
    }),
  }))
  await json(await fetch(`${baseUrl}/api/sessions/${reviewerSession.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'running' }),
  }))

  const review = await json(await fetch(`${baseUrl}/api/reviews`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId: project.id,
      batchId: batch.id,
      taskId: 'T001',
      reviewerSessionId: reviewerSession.id,
      sha: 'smoke-sha',
    }),
  }))
  if (review.status !== 'requested' || review.requestedSha !== 'smoke-sha') throw new Error('Review handoff was not created')

  const reviewResult = await json(await fetch(`${baseUrl}/api/reviews/${review.id}/result`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ result: 'passed', reviewedSha: 'smoke-sha' }),
  }))
  if (reviewResult.status !== 'passed' || reviewResult.actionable !== true) throw new Error('Review pass was not actionable')

  const state = await json(await fetch(`${baseUrl}/api/state`))
  const storedTask = state.batches[0].tasks[0]
  if (
    state.projects.length !== 1
    || state.batches.length !== 1
    || state.adapters.length !== 2
    || state.sessions.length !== 2
    || state.reviews.length !== 1
  ) throw new Error('State snapshot is incomplete')
  if (storedTask.status !== 'review_passed' || storedTask.reviewedSha !== 'smoke-sha') {
    throw new Error('Valid review handoff did not update task review state')
  }

  const forgedPass = await fetch(`${baseUrl}/api/batches/${batch.id}/tasks/T001`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'review_passed' }),
  })
  if (forgedPass.ok) throw new Error('Direct task PATCH forged review_passed')

  const dashboard = await fetch(`${baseUrl}/`)
  const html = await dashboard.text()
  if (!dashboard.ok || !html.includes('Mira Forge')) throw new Error('Built dashboard is not served by the control plane')

  console.log(`Smoke OK: ${baseUrl}`)
} finally {
  child.kill('SIGTERM')
  await Promise.race([once(child, 'exit'), sleep(1000)])
}

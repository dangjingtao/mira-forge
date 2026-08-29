import { once } from 'node:events'
import { mkdtemp } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

const rootDir = resolve(import.meta.dirname, '..')
const tempDir = await mkdtemp(join(tmpdir(), 'mira-forge-readiness-smoke-'))
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

async function json(response) {
  const body = await response.json()
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body)}`)
  return body
}

const port = await reservePort()
const baseUrl = `http://127.0.0.1:${port}`
const child = spawn(process.execPath, ['server/index.mjs'], {
  cwd: rootDir,
  env: { ...process.env, MIRA_FORGE_PORT: String(port), MIRA_FORGE_STATE_FILE: stateFile },
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
  if (!healthy) throw new Error(`Forge readiness smoke did not become healthy.\n${logs}`)

  const project = await json(await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Readiness Project', rootPath: tempDir, integrationBranch: 'dev' }),
  }))

  const invalidBatch = await fetch(`${baseUrl}/api/batches`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: project.id, tasks: [{ id: 'T-bad', dependsOn: ['missing'] }] }),
  })
  if (invalidBatch.ok) throw new Error('Invalid dependency batch was accepted')
  const batchesAfterInvalid = await json(await fetch(`${baseUrl}/api/batches`))
  if (batchesAfterInvalid.length !== 0) throw new Error('Invalid batch was persisted before dependency validation')

  const batch = await json(await fetch(`${baseUrl}/api/batches`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId: project.id,
      name: 'Readiness Batch',
      tasks: [
        { id: 'T001', title: 'Foundation' },
        { id: 'T002', title: 'Dependent', dependsOn: ['T001'] },
      ],
    }),
  }))

  const initial = await json(await fetch(`${baseUrl}/api/batches/${batch.id}/dispatch-ready`))
  if (initial.ready.length !== 1 || initial.ready[0].taskId !== 'T001') {
    throw new Error(`Unexpected initial readiness: ${JSON.stringify(initial)}`)
  }

  await json(await fetch(`${baseUrl}/api/batches/${batch.id}/tasks/T001`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'integrated' }),
  }))

  const afterDependency = await json(await fetch(`${baseUrl}/api/batches/${batch.id}/dispatch-ready`))
  if (afterDependency.ready.length !== 1 || afterDependency.ready[0].taskId !== 'T002') {
    throw new Error(`Dependency completion did not release T002: ${JSON.stringify(afterDependency)}`)
  }

  const builder = await json(await fetch(`${baseUrl}/api/adapters`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'readiness-builder', name: 'Readiness Builder', kind: 'builder' }),
  }))
  const session = await json(await fetch(`${baseUrl}/api/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      role: 'builder',
      adapterId: builder.id,
      projectId: project.id,
      batchId: batch.id,
      taskId: 'T002',
    }),
  }))

  const blocked = await json(await fetch(`${baseUrl}/api/batches/${batch.id}/dispatch-ready`))
  if (blocked.ready.length !== 0) throw new Error('Active builder session did not block T002')
  const t2 = blocked.blocked.find((task) => task.taskId === 'T002')
  if (!t2?.reasons.some((reason) => reason.code === 'active_builder_session' && reason.sessionId === session.id)) {
    throw new Error(`Active builder reason missing: ${JSON.stringify(blocked)}`)
  }

  console.log(`Readiness smoke OK: ${baseUrl}`)
} finally {
  child.kill('SIGTERM')
  await Promise.race([once(child, 'exit'), sleep(1000)])
}

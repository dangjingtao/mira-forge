import { once } from 'node:events'
import { mkdtemp } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

const rootDir = resolve(import.meta.dirname, '..')
const tempDir = await mkdtemp(join(tmpdir(), 'mira-forge-dispatch-smoke-'))
const stateFile = join(tempDir, 'state.json')
const fakeOpenCode = join(rootDir, 'scripts', 'fake-opencode.mjs')

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

async function waitForDispatch(baseUrl, dispatchId, status, timeoutMs = 5000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const dispatches = await json(await fetch(`${baseUrl}/api/dispatches`))
    const dispatch = dispatches.find((item) => item.id === dispatchId)
    if (dispatch?.status === status) return dispatch
    await sleep(50)
  }
  throw new Error(`Dispatch ${dispatchId} did not reach ${status}`)
}

const port = await reservePort()
const baseUrl = `http://127.0.0.1:${port}`
const child = spawn(process.execPath, ['server/index.mjs'], {
  cwd: rootDir,
  env: {
    ...process.env,
    MIRA_FORGE_PORT: String(port),
    MIRA_FORGE_STATE_FILE: stateFile,
    MIRA_FORGE_OPENCODE_BIN: process.execPath,
    MIRA_FORGE_OPENCODE_PREFIX_ARGS: JSON.stringify([fakeOpenCode]),
    MIRA_FORGE_FAKE_OPENCODE_DELAY_MS: '200',
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
  if (!healthy) throw new Error(`Forge dispatch smoke did not become healthy.\n${logs}`)

  const project = await json(await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Dispatch Smoke', rootPath: tempDir, integrationBranch: 'dev' }),
  }))

  const batch = await json(await fetch(`${baseUrl}/api/batches`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId: project.id,
      name: 'Dispatch Batch',
      tasks: [
        { id: 'T001', title: 'Successful fake Builder' },
        { id: 'T002', title: 'Cancelled fake Builder' },
      ],
    }),
  }))

  const dispatchResponse = await fetch(`${baseUrl}/api/batches/${batch.id}/tasks/T001/dispatch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'Perform the smoke task without external side effects.' }),
  })
  if (dispatchResponse.status !== 202) throw new Error(`Dispatch did not return 202: ${dispatchResponse.status}`)
  const dispatch = await dispatchResponse.json()
  if (Object.hasOwn(dispatch, 'prompt')) throw new Error('Dispatch persisted the full prompt')

  const duplicate = await fetch(`${baseUrl}/api/batches/${batch.id}/tasks/T001/dispatch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'This duplicate must be blocked.' }),
  })
  if (duplicate.ok) throw new Error('Duplicate dispatch bypassed active task/session gate')

  const completed = await waitForDispatch(baseUrl, dispatch.id, 'completed')
  if (completed.externalSessionId !== 'ses_fake_dispatch') throw new Error('OpenCode sessionID was not bound')
  if (completed.resultText !== 'fake builder completed') throw new Error(`Unexpected result text: ${completed.resultText}`)

  const cancelDispatch = await json(await fetch(`${baseUrl}/api/batches/${batch.id}/tasks/T002/dispatch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'This fake task will be cancelled.' }),
  }))
  const cancelled = await json(await fetch(`${baseUrl}/api/dispatches/${cancelDispatch.id}/cancel`, {
    method: 'POST',
  }))
  if (cancelled.status !== 'cancelled') throw new Error(`Cancel did not persist: ${JSON.stringify(cancelled)}`)

  const state = await json(await fetch(`${baseUrl}/api/state`))
  const t1 = state.batches[0].tasks.find((task) => task.id === 'T001')
  const t2 = state.batches[0].tasks.find((task) => task.id === 'T002')
  if (t1.status !== 'reviewing') throw new Error(`Successful Builder did not move to review stage: ${t1.status}`)
  if (t2.status !== 'interrupted') throw new Error(`Cancelled Builder did not interrupt task: ${t2.status}`)
  if (state.dispatches.length !== 2 || state.sessions.length !== 2) throw new Error('Dispatch/session evidence is incomplete')

  const events = await json(await fetch(`${baseUrl}/api/events?projectId=${project.id}`))
  const eventTypes = events.map((event) => event.type)
  for (const type of ['dispatch.queued', 'dispatch.started', 'dispatch.session_bound', 'dispatch.completed', 'dispatch.cancelled']) {
    if (!eventTypes.includes(type)) throw new Error(`Missing runtime event: ${type}`)
  }

  const meta = await json(await fetch(`${baseUrl}/api/meta`))
  if (!meta.dispatchStatuses.includes('completed') || !meta.builtinBuilderAdapters.includes('opencode-local')) {
    throw new Error('Dispatch metadata is incomplete')
  }

  console.log(`Dispatch smoke OK: ${baseUrl}`)
} finally {
  child.kill('SIGTERM')
  await Promise.race([once(child, 'exit'), sleep(1500)])
}

import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createBatch, registerProject } from './domain.mjs'
import { createDispatchManager, OPENCODE_ADAPTER_ID } from './dispatch-manager.mjs'
import { createStore } from './store.mjs'

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'mira-forge-dispatch-test-'))
  const store = createStore(join(dir, 'state.json'))
  const ids = await store.mutate((state) => {
    const project = registerProject(state, { name: 'Dispatch Demo', rootPath: dir, integrationBranch: 'dev' })
    const batch = createBatch(state, { projectId: project.id, tasks: [{ id: 'T009', title: 'Dispatch it' }] })
    return { projectId: project.id, batchId: batch.id }
  })
  return { dir, store, ...ids }
}

async function waitFor(check, timeoutMs = 1000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const result = await check()
    if (result) return result
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5))
  }
  throw new Error('timed out waiting for dispatch state')
}

function successfulRunner() {
  return {
    start(input) {
      queueMicrotask(() => {
        input.onStarted({ pid: 101 })
        input.onEvent({ type: 'step_start', sessionID: 'ses_success' })
        input.onExit({ code: 0, signal: null, stderr: '', resultText: 'builder done' })
      })
      return { kill: () => true }
    },
  }
}

test('dispatch creates durable attempt/session and completes into review stage', async () => {
  const { store, batchId } = await fixture()
  const manager = createDispatchManager({
    store,
    runners: new Map([[OPENCODE_ADAPTER_ID, successfulRunner()]]),
  })

  const dispatch = await manager.dispatchTask({ batchId, taskId: 'T009', prompt: 'Do T009' })
  assert.equal(dispatch.status, 'starting')
  assert.equal(dispatch.promptSource, 'inline')
  assert.equal(Object.hasOwn(dispatch, 'prompt'), false)

  const state = await waitFor(async () => {
    const snapshot = await store.read()
    return snapshot.dispatches[0]?.status === 'completed' ? snapshot : null
  })

  assert.equal(state.dispatches.length, 1)
  assert.equal(state.dispatches[0].externalSessionId, 'ses_success')
  assert.equal(state.dispatches[0].resultText, 'builder done')
  assert.equal(state.sessions[0].status, 'completed')
  assert.equal(state.sessions[0].externalSessionId, 'ses_success')
  assert.equal(state.batches[0].tasks[0].status, 'reviewing')
  assert.deepEqual(
    state.events.map((event) => event.type),
    ['dispatch.queued', 'dispatch.started', 'dispatch.session_bound', 'dispatch.completed'],
  )
})

test('active Builder session blocks a duplicate dispatch', async () => {
  const { store, batchId } = await fixture()
  let startInput
  const runner = {
    start(input) {
      startInput = input
      queueMicrotask(() => input.onStarted({ pid: 202 }))
      return { kill: () => true }
    },
  }
  const manager = createDispatchManager({ store, runners: new Map([[OPENCODE_ADAPTER_ID, runner]]) })

  await manager.dispatchTask({ batchId, taskId: 'T009', prompt: 'First' })
  await waitFor(async () => (await store.read()).dispatches[0]?.status === 'running')
  await assert.rejects(
    () => manager.dispatchTask({ batchId, taskId: 'T009', prompt: 'Second' }),
    /not dispatch-ready/,
  )
  assert.ok(startInput)
})

test('spawn failure interrupts task and marks local adapter error', async () => {
  const { store, batchId } = await fixture()
  const runner = {
    start(input) {
      queueMicrotask(() => input.onError(new Error('spawn opencode ENOENT'), { stderr: '' }))
      return { kill: () => true }
    },
  }
  const manager = createDispatchManager({ store, runners: new Map([[OPENCODE_ADAPTER_ID, runner]]) })

  await manager.dispatchTask({ batchId, taskId: 'T009', prompt: 'Fail please' })
  const state = await waitFor(async () => {
    const snapshot = await store.read()
    return snapshot.dispatches[0]?.status === 'failed' ? snapshot : null
  })

  assert.match(state.dispatches[0].error, /ENOENT/)
  assert.equal(state.sessions[0].status, 'failed')
  assert.equal(state.batches[0].tasks[0].status, 'interrupted')
  assert.equal(state.adapters[0].status, 'error')
  assert.equal(state.events.at(-1).type, 'dispatch.failed')
})

test('explicit cancel wins over later child exit callback', async () => {
  const { store, batchId } = await fixture()
  let callbacks
  let killed = false
  const runner = {
    start(input) {
      callbacks = input
      queueMicrotask(() => input.onStarted({ pid: 303 }))
      return { kill: () => { killed = true; return true } }
    },
  }
  const manager = createDispatchManager({ store, runners: new Map([[OPENCODE_ADAPTER_ID, runner]]) })
  const dispatch = await manager.dispatchTask({ batchId, taskId: 'T009', prompt: 'Long task' })
  await waitFor(async () => (await store.read()).dispatches[0]?.status === 'running')

  await manager.cancelDispatch(dispatch.id)
  callbacks.onExit({ code: 0, signal: null, stderr: '', resultText: 'too late' })
  const state = await waitFor(async () => (await store.read()).dispatches[0]?.status === 'cancelled' && await store.read())

  assert.equal(killed, true)
  assert.equal(state.dispatches[0].status, 'cancelled')
  assert.equal(state.sessions[0].status, 'disconnected')
  assert.equal(state.batches[0].tasks[0].status, 'interrupted')
  assert.equal(state.events.at(-1).type, 'dispatch.cancelled')
})

test('startup reconciliation invalidates supervision claims from an older process', async () => {
  const { store, batchId } = await fixture()
  const runner = {
    start(input) {
      queueMicrotask(() => input.onStarted({ pid: 404 }))
      return { kill: () => true }
    },
  }
  const firstManager = createDispatchManager({ store, runners: new Map([[OPENCODE_ADAPTER_ID, runner]]) })
  await firstManager.dispatchTask({ batchId, taskId: 'T009', prompt: 'Keep running' })
  await waitFor(async () => (await store.read()).dispatches[0]?.status === 'running')

  const nextManager = createDispatchManager({ store, runners: new Map() })
  const count = await nextManager.reconcile()
  const state = await store.read()

  assert.equal(count, 1)
  assert.equal(state.dispatches[0].status, 'interrupted')
  assert.equal(state.sessions[0].status, 'disconnected')
  assert.equal(state.batches[0].tasks[0].status, 'interrupted')
  assert.equal(state.events.at(-1).data.reason, 'control_plane_restart')
})

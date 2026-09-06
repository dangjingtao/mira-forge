import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { OPENCODE_ADAPTER_ID, PIAGENT_ADAPTER_ID } from './builder-contract.mjs'
import { createBatch, registerProject } from './domain.mjs'
import { createDispatchManager } from './dispatch-manager.mjs'
import { createStore } from './store.mjs'

async function waitFor(check, timeoutMs = 1000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const result = await check()
    if (result) return result
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5))
  }
  throw new Error('timed out waiting for dispatch state')
}

test('V1 keeps one global active Builder dispatch even when another adapter is selected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mira-forge-serial-dispatch-'))
  const store = createStore(join(dir, 'state.json'))
  const { batchId } = await store.mutate((state) => {
    const project = registerProject(state, { name: 'Serial Demo', rootPath: dir, integrationBranch: 'dev' })
    const batch = createBatch(state, {
      projectId: project.id,
      tasks: [
        { id: 'T001', title: 'First ready task' },
        { id: 'T002', title: 'Second ready task' },
      ],
    })
    return { batchId: batch.id }
  })

  const callbacks = []
  const runner = {
    start(input) {
      callbacks.push(input)
      queueMicrotask(() => input.onStarted({ pid: 606 + callbacks.length }))
      return { kill: () => true }
    },
  }
  const manager = createDispatchManager({
    store,
    runners: new Map([
      [OPENCODE_ADAPTER_ID, runner],
      [PIAGENT_ADAPTER_ID, runner],
    ]),
  })

  const first = await manager.dispatchTask({ batchId, taskId: 'T001', builder: 'opencode', prompt: 'First task' })
  await waitFor(async () => (await store.read()).dispatches[0]?.status === 'running')

  await assert.rejects(
    () => manager.dispatchTask({ batchId, taskId: 'T002', builder: 'piagent', prompt: 'Second task' }),
    /builder dispatch already active/,
  )

  const midState = await store.read()
  assert.equal(midState.dispatches.length, 1)
  assert.equal(midState.sessions.length, 1)
  assert.equal(midState.batches[0].tasks.find((task) => task.id === 'T002').status, 'waiting')

  callbacks[0].onExit({ code: 0, signal: null, stderr: '', resultText: 'first done' })
  await waitFor(async () => (await store.read()).dispatches[0]?.status === 'completed')

  const second = await manager.dispatchTask({ batchId, taskId: 'T002', builder: 'piagent', prompt: 'Second task after first completed' })
  assert.notEqual(second.id, first.id)
  assert.equal(second.adapterId, PIAGENT_ADAPTER_ID)
  assert.equal((await store.read()).dispatches.length, 2)
})

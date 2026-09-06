import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { CODEX_ADAPTER_ID, OPENCODE_ADAPTER_ID, PIAGENT_ADAPTER_ID } from './builder-contract.mjs'
import { createDispatchManager } from './dispatch-manager.mjs'
import { createBatch, registerProject } from './domain.mjs'
import { createStore } from './store.mjs'

async function fixture(taskId = 'T016') {
  const dir = await mkdtemp(join(tmpdir(), 'mira-forge-builder-choice-'))
  const store = createStore(join(dir, 'state.json'))
  const { batchId } = await store.mutate((state) => {
    const project = registerProject(state, { name: 'Builder Choice', rootPath: dir, integrationBranch: 'dev' })
    const batch = createBatch(state, { projectId: project.id, tasks: [{ id: taskId, title: 'Build it' }] })
    return { batchId: batch.id }
  })
  return { dir, store, batchId, taskId }
}

async function waitFor(check, timeoutMs = 1000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const result = await check()
    if (result) return result
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5))
  }
  throw new Error('timed out waiting for builder dispatch state')
}

function completingRunner({ externalSessionId, provider }) {
  return {
    start(input) {
      queueMicrotask(() => {
        input.onStarted({ pid: 7001 })
        input.onEvent({
          externalSessionId,
          provider: { adapter: provider, eventType: 'session.started', status: 'running' },
        })
        input.onEvent({
          tool: { name: 'edit', status: 'completed' },
          provider: { adapter: provider, eventType: 'tool.completed', itemType: 'tool', status: 'completed' },
        })
        input.onExit({ code: 0, signal: null, stderr: '', resultText: `${provider} done`, errorText: null })
      })
      return { kill: () => true }
    },
  }
}

for (const [choice, adapterId, provider] of [
  ['opencode', OPENCODE_ADAPTER_ID, 'opencode'],
  ['piagent', PIAGENT_ADAPTER_ID, 'piagent'],
  ['codex', CODEX_ADAPTER_ID, 'codex'],
]) {
  test(`explicit ${choice} Builder choice uses the shared dispatch contract`, async () => {
    const { store, batchId, taskId } = await fixture()
    const manager = createDispatchManager({
      store,
      runners: new Map([[adapterId, completingRunner({ externalSessionId: `${choice}-session`, provider })]]),
    })

    const dispatch = await manager.dispatchTask({ batchId, taskId, builder: choice, prompt: `Do ${taskId}` })
    assert.equal(dispatch.adapterId, adapterId)

    const state = await waitFor(async () => {
      const snapshot = await store.read()
      return snapshot.dispatches[0]?.status === 'completed' ? snapshot : null
    })

    assert.equal(state.adapters[0].id, adapterId)
    assert.equal(state.sessions[0].externalSessionId, `${choice}-session`)
    assert.equal(state.dispatches[0].externalSessionId, `${choice}-session`)
    assert.equal(state.batches[0].tasks[0].status, 'reviewing')
    assert.equal(state.events.some((event) => event.type === 'dispatch.provider_event'), true)
  })
}

test('preferredBuilder handoff aliases resolve without changing the dispatch authority', async () => {
  const { store, batchId, taskId } = await fixture()
  const manager = createDispatchManager({
    store,
    runners: new Map([[PIAGENT_ADAPTER_ID, completingRunner({ externalSessionId: 'pi-session', provider: 'piagent' })]]),
  })

  const dispatch = await manager.dispatchTask({
    batchId,
    taskId,
    preferredBuilder: 'pi',
    prompt: 'Do it',
  })
  assert.equal(dispatch.adapterId, PIAGENT_ADAPTER_ID)
})

test('provider-reported error fails dispatch even when the child exits zero', async () => {
  const { store, batchId, taskId } = await fixture()
  const runner = {
    start(input) {
      queueMicrotask(() => {
        input.onStarted({ pid: 7002 })
        input.onExit({ code: 0, signal: null, stderr: '', resultText: null, errorText: 'provider failed' })
      })
      return { kill: () => true }
    },
  }
  const manager = createDispatchManager({ store, runners: new Map([[PIAGENT_ADAPTER_ID, runner]]) })

  await manager.dispatchTask({ batchId, taskId, builder: 'piagent', prompt: 'Do it' })
  const state = await waitFor(async () => {
    const snapshot = await store.read()
    return snapshot.dispatches[0]?.status === 'failed' ? snapshot : null
  })

  assert.equal(state.sessions[0].status, 'failed')
  assert.equal(state.batches[0].tasks[0].status, 'interrupted')
  assert.equal(state.dispatches[0].error, 'provider failed')
})

test('builder choice and adapterId cannot silently disagree', async () => {
  const { store, batchId, taskId } = await fixture()
  const manager = createDispatchManager({ store, runners: new Map() })
  await assert.rejects(
    () => manager.dispatchTask({ batchId, taskId, builder: 'codex', adapterId: OPENCODE_ADAPTER_ID, prompt: 'Nope' }),
    /conflicts with builder/,
  )
})

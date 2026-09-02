import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { appendBuilderResultHandoff } from './main-thread-domain.mjs'
import { createMainThreadManager, getPendingBuilderResults } from './main-thread-manager.mjs'
import { createStore } from './store.mjs'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'mira-forge-t018-context-'))
  const store = createStore(join(root, 'state.json'))
  await store.mutate((state) => {
    state.projects.push({
      id: 'p1',
      name: 'T018 Context',
      rootPath: root,
      repository: null,
      taskLedger: null,
      taskDir: null,
      integrationBranch: 'dev',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  })
  return { root, store }
}

test('next Main Thread turn receives a durable Builder result once without merging Builder conversation history', async () => {
  const { store } = await fixture()
  const prompts = []
  const adapter = {
    id: 'opencode',
    async runTurn(input) {
      prompts.push(input.message)
      return {
        externalThreadId: input.externalThreadId || 'main-thread-1',
        responseText: 'acknowledged',
        events: [],
        providerEventType: 'fixture.completed',
      }
    },
  }
  const manager = createMainThreadManager({ store, adapters: new Map([['opencode', adapter]]) })
  const thread = await manager.openThread({ projectId: 'p1', adapter: 'opencode' })

  await manager.sendMessage(thread.id, { message: 'Start planning.' })
  await store.mutate((state) => appendBuilderResultHandoff(state, thread.id, {
    projectId: 'p1',
    batchId: 'B-1',
    taskId: 'T018',
    taskRef: 'docs/workbench/tasks/T018-live-runtime-surface.md',
    dispatchId: 'D-1',
    sessionId: 'S-1',
    adapterId: 'codex-local',
    dispatchStatus: 'completed',
    sessionStatus: 'completed',
    taskStatus: 'reviewing',
    externalSessionId: 'codex-builder-1',
    resultText: 'Implemented the child task. Validation passed. Review is still required.',
    error: null,
    startedAt: '2026-09-02T00:00:00.000Z',
    endedAt: '2026-09-02T00:01:00.000Z',
  }))

  await manager.sendMessage(thread.id, { message: 'Continue from the child result.' })
  assert.match(prompts[1], /## Builder Result Handoffs/)
  assert.match(prompts[1], /T018 · codex-local/)
  assert.match(prompts[1], /Dispatch: completed · Session: completed · Task: reviewing/)
  assert.match(prompts[1], /dispatch D-1 · session S-1/)
  assert.match(prompts[1], /Validation passed/)
  assert.doesNotMatch(prompts[1], /Builder conversation history/)

  await manager.sendMessage(thread.id, { message: 'Continue again.' })
  assert.doesNotMatch(prompts[2], /## Builder Result Handoffs/)
  assert.doesNotMatch(prompts[2], /Validation passed/)
})

test('Builder result arriving after a prior user turn remains pending for the next user turn', () => {
  const events = [
    { id: 'u1', type: 'message', role: 'user' },
    { id: 'r1', type: 'handoff', handoff: { kind: 'builder_result', dispatchId: 'D-1' } },
    { id: 'done1', type: 'status', text: 'turn.completed' },
    { id: 'u2', type: 'message', role: 'user' },
    { id: 'started2', type: 'status', text: 'turn.started' },
  ]

  assert.deepEqual(getPendingBuilderResults(events).map((event) => event.id), ['r1'])
})

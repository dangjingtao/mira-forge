import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appendBuilderResultHandoff,
  beginMainThreadTurn,
  completeMainThreadTurn,
  createMainThread,
  createMainThreadHandoff,
  getMainThreadEvents,
  reconcileMainThreads,
} from './main-thread-domain.mjs'
import { createEmptyState } from './store.mjs'

function stateWithProject() {
  const state = createEmptyState()
  state.projects.push({
    id: 'p1',
    name: 'Demo',
    rootPath: '/tmp/demo',
    integrationBranch: 'dev',
  })
  return state
}

test('main thread keeps a small durable normalized event history', () => {
  const state = stateWithProject()
  const thread = createMainThread(state, { projectId: 'p1', adapter: 'opencode' })

  beginMainThreadTurn(state, thread.id, 'inspect the project')
  completeMainThreadTurn(state, thread.id, {
    externalThreadId: 'ses-1',
    responseText: 'The project is ready for planning.',
    events: [
      {
        type: 'thinking',
        text: 'checking the task ledger',
        provider: { adapter: 'opencode', eventType: 'reasoning', itemType: 'reasoning' },
      },
      {
        type: 'tool',
        tool: { name: 'read', status: 'completed' },
        provider: { adapter: 'opencode', eventType: 'tool.completed', itemType: 'tool' },
      },
    ],
  })

  assert.equal(thread.status, 'idle')
  assert.equal(thread.externalThreadId, 'ses-1')
  assert.deepEqual(
    getMainThreadEvents(state, thread.id).filter((event) => event.type === 'message').map((event) => [event.role, event.text]),
    [
      ['user', 'inspect the project'],
      ['assistant', 'The project is ready for planning.'],
    ],
  )
  assert.equal(getMainThreadEvents(state, thread.id).some((event) => event.type === 'thinking'), true)
  assert.equal(getMainThreadEvents(state, thread.id).some((event) => event.type === 'tool'), true)
})

test('main thread handoff stores references only and never dispatches', () => {
  const state = stateWithProject()
  const thread = createMainThread(state, { projectId: 'p1', adapter: 'codex' })
  const event = createMainThreadHandoff(state, thread.id, {
    projectId: 'p1',
    taskId: 'T900',
    taskRef: 'docs/tasks/T900.md',
    preferredBuilder: 'opencode-local',
  })

  assert.deepEqual(event.handoff, {
    projectId: 'p1',
    taskId: 'T900',
    taskRef: 'docs/tasks/T900.md',
    preferredBuilder: 'opencode-local',
  })
  assert.equal('body' in event.handoff, false)
  assert.deepEqual(state.dispatches, [])
})

test('Builder result handoff is idempotent per dispatch and preserves authoritative identities', () => {
  const state = stateWithProject()
  const thread = createMainThread(state, { projectId: 'p1', adapter: 'opencode' })
  const input = {
    projectId: 'p1',
    batchId: 'B-1',
    taskId: 'T018',
    taskRef: 'docs/tasks/T018.md',
    dispatchId: 'D-1',
    sessionId: 'S-1',
    adapterId: 'codex-local',
    dispatchStatus: 'completed',
    sessionStatus: 'completed',
    taskStatus: 'reviewing',
    externalSessionId: 'codex-thread-1',
    resultText: 'Implemented the live runtime surface. Validation passed.',
    error: null,
    startedAt: '2026-09-02T00:00:00.000Z',
    endedAt: '2026-09-02T00:01:00.000Z',
  }

  const first = appendBuilderResultHandoff(state, thread.id, input)
  const second = appendBuilderResultHandoff(state, thread.id, input)
  const results = getMainThreadEvents(state, thread.id).filter((event) => event.handoff?.kind === 'builder_result')

  assert.equal(first.id, second.id)
  assert.equal(results.length, 1)
  assert.deepEqual(results[0].handoff, {
    kind: 'builder_result',
    projectId: 'p1',
    batchId: 'B-1',
    taskId: 'T018',
    taskRef: 'docs/tasks/T018.md',
    dispatchId: 'D-1',
    sessionId: 'S-1',
    adapterId: 'codex-local',
    dispatchStatus: 'completed',
    sessionStatus: 'completed',
    taskStatus: 'reviewing',
    externalSessionId: 'codex-thread-1',
    resultText: 'Implemented the live runtime surface. Validation passed.',
    error: null,
    startedAt: '2026-09-02T00:00:00.000Z',
    endedAt: '2026-09-02T00:01:00.000Z',
  })
})

test('running main threads reconcile to an explicit interrupted error after restart', () => {
  const state = stateWithProject()
  const thread = createMainThread(state, { projectId: 'p1', adapter: 'codex' })
  beginMainThreadTurn(state, thread.id, 'keep going')

  const interrupted = reconcileMainThreads(state)

  assert.deepEqual(interrupted, [thread.id])
  assert.equal(thread.status, 'error')
  assert.match(thread.lastError, /restarted/)
  assert.match(getMainThreadEvents(state, thread.id).at(-1).text, /interrupted/)
})

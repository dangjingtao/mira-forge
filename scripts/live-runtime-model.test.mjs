import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLiveRuntimeRows, formatRuntimeDuration } from '../src/workbench/live-runtime-model.js'

function fixture() {
  return {
    projectId: 'p1',
    batches: [{
      id: 'B-1',
      projectId: 'p1',
      name: 'Runtime',
      status: 'reviewing',
      updatedAt: '2026-09-02T00:03:00.000Z',
      tasks: [
        { id: 'T1', title: 'Active build', status: 'building', builder: 'codex-local', reviewRound: 0, dependsOn: [], updatedAt: '2026-09-02T00:03:00.000Z' },
        { id: 'T2', title: 'Needs review', status: 'reviewing', builder: 'opencode-local', reviewRound: 0, dependsOn: [], updatedAt: '2026-09-02T00:02:00.000Z' },
        { id: 'T3', title: 'Blocked work', status: 'waiting', builder: null, reviewRound: 0, dependsOn: ['T4'], updatedAt: '2026-09-02T00:01:00.000Z' },
        { id: 'T4', title: 'Dependency', status: 'review_passed', builder: null, reviewRound: 1, dependsOn: [], updatedAt: '2026-09-02T00:00:00.000Z' },
      ],
    }],
    dispatches: [{
      id: 'D-1',
      projectId: 'p1',
      batchId: 'B-1',
      taskId: 'T1',
      adapterId: 'codex-local',
      sessionId: 'S-1',
      sourceThreadId: 'MT-1',
      status: 'running',
      externalSessionId: 'codex-1',
      resultText: null,
      error: null,
      startedAt: '2026-09-02T00:00:00.000Z',
      endedAt: null,
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:03:00.000Z',
    }],
    sessions: [{
      id: 'S-1',
      role: 'builder',
      adapterId: 'codex-local',
      projectId: 'p1',
      batchId: 'B-1',
      taskId: 'T1',
      status: 'running',
      externalSessionId: 'codex-1',
      startedAt: '2026-09-02T00:00:00.000Z',
      endedAt: null,
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:03:00.000Z',
    }],
    reviews: [],
    threads: [{
      id: 'MT-1',
      projectId: 'p1',
      adapter: 'opencode',
      title: 'Demo main thread',
      model: null,
      status: 'idle',
      externalThreadId: 'main-1',
      lastError: null,
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:03:00.000Z',
    }],
  }
}

test('live runtime mapping keeps active, blocked and review-needed states distinct', () => {
  const rows = buildLiveRuntimeRows(fixture())
  const active = rows.find((row) => row.id === 'session:S-1')
  const blocked = rows.find((row) => row.id === 'blocked:B-1:T3')
  const reviewNeeded = rows.find((row) => row.id === 'review-needed:B-1:T2')

  assert.equal(active.active, true)
  assert.equal(active.status, 'running')
  assert.equal(active.threadId, 'MT-1')
  assert.equal(blocked.status, 'blocked')
  assert.equal(blocked.attention, true)
  assert.match(blocked.detail, /T4/)
  assert.equal(reviewNeeded.status, 'review_needed')
  assert.equal(reviewNeeded.taskStatus, 'reviewing')
})

test('live runtime mapping does not mark a Main Thread or task from another project', () => {
  const input = fixture()
  input.threads.push({
    ...input.threads[0],
    id: 'MT-other',
    projectId: 'p2',
    title: 'Other project',
  })
  const rows = buildLiveRuntimeRows(input)

  assert.equal(rows.some((row) => row.id === 'thread:MT-other'), false)
  assert.equal(rows.every((row) => row.projectId === 'p1'), true)
})

test('runtime duration uses observed timestamps without inventing progress', () => {
  assert.equal(formatRuntimeDuration('2026-09-02T00:00:00.000Z', '2026-09-02T00:01:05.000Z'), '1m 5s')
  assert.equal(formatRuntimeDuration(null, null), 'not started')

  const input = fixture()
  input.dispatches[0].status = 'starting'
  input.sessions[0].status = 'starting'
  input.sessions[0].startedAt = null
  const starting = buildLiveRuntimeRows(input).find((row) => row.id === 'session:S-1')
  assert.equal(starting.startedAt, null)
  assert.equal(formatRuntimeDuration(starting.startedAt, starting.endedAt), 'not started')
})

test('a resolved historical failure becomes passive instead of permanent attention', () => {
  const input = fixture()
  input.dispatches[0].status = 'failed'
  input.dispatches[0].error = 'old failure'
  input.sessions[0].status = 'failed'
  input.sessions[0].endedAt = '2026-09-02T00:02:00.000Z'
  input.batches[0].tasks[0].status = 'interrupted'

  let row = buildLiveRuntimeRows(input).find((item) => item.id === 'session:S-1')
  assert.equal(row.attention, true)

  input.batches[0].tasks[0].status = 'building'
  row = buildLiveRuntimeRows(input).find((item) => item.id === 'session:S-1')
  assert.equal(row.attention, false)
})

test('actionable rows are not truncated by the passive history cap', () => {
  const tasks = [
    { id: 'DEP', title: 'Dependency', status: 'waiting', builder: null, reviewRound: 0, dependsOn: [] },
    ...Array.from({ length: 20 }, (_, index) => ({
      id: `B${index + 1}`,
      title: `Blocked ${index + 1}`,
      status: 'waiting',
      builder: null,
      reviewRound: 0,
      dependsOn: ['DEP'],
    })),
  ]
  const rows = buildLiveRuntimeRows({
    projectId: 'p1',
    batches: [{ id: 'B-many', projectId: 'p1', name: 'Many blockers', status: 'planned', tasks }],
    dispatches: [],
    sessions: [],
    reviews: [],
    threads: [],
  })

  const blocked = rows.filter((row) => row.status === 'blocked')
  assert.equal(blocked.length, 20)
  assert.equal(blocked.every((row) => row.attention), true)
})

test('polling state changes keep stable row identity for the same durable session', () => {
  const input = fixture()
  const before = buildLiveRuntimeRows(input).find((row) => row.sessionId === 'S-1')
  input.dispatches[0].updatedAt = '2026-09-02T00:04:00.000Z'
  input.sessions[0].updatedAt = '2026-09-02T00:04:00.000Z'
  const after = buildLiveRuntimeRows(input).find((row) => row.sessionId === 'S-1')

  assert.equal(before.id, 'session:S-1')
  assert.equal(after.id, before.id)
})

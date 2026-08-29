import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createBatch,
  createReviewHandoff,
  createSession,
  heartbeatAdapter,
  registerAdapter,
  registerProject,
  resolveReviewHandoff,
  updateSession,
  updateTask,
} from './domain.mjs'
import { createEmptyState } from './store.mjs'

test('project, batch and task runtime state form the minimal pipeline', () => {
  const state = createEmptyState()
  const project = registerProject(state, { name: 'Demo', rootPath: '/tmp/demo' })
  const batch = createBatch(state, { projectId: project.id, tasks: [{ id: 'T001', title: 'Build control plane' }] })

  updateTask(state, batch.id, 'T001', { status: 'building', builder: 'opencode' })
  assert.equal(batch.status, 'active')

  updateTask(state, batch.id, 'T001', { status: 'reviewing', currentSha: 'abc' })
  assert.equal(batch.status, 'reviewing')
})

test('invalid runtime status is rejected', () => {
  const state = createEmptyState()
  const project = registerProject(state, { name: 'Demo', rootPath: '/tmp/demo' })
  const batch = createBatch(state, { projectId: project.id, tasks: [{ id: 'T001' }] })
  assert.throws(() => updateTask(state, batch.id, 'T001', { status: 'done-ish' }), /invalid task status/)
})

test('task patches cannot forge review evidence or review round', () => {
  const state = createEmptyState()
  const project = registerProject(state, { name: 'Demo', rootPath: '/tmp/demo' })
  const batch = createBatch(state, { projectId: project.id, tasks: [{ id: 'T001' }] })
  updateTask(state, batch.id, 'T001', { currentSha: 'abc' })

  assert.throws(
    () => updateTask(state, batch.id, 'T001', { status: 'review_passed' }),
    /review_passed is managed by review handoff/,
  )
  assert.throws(
    () => updateTask(state, batch.id, 'T001', { reviewedSha: 'abc' }),
    /reviewedSha is managed by review handoff/,
  )
  assert.throws(
    () => updateTask(state, batch.id, 'T001', { reviewRound: 99 }),
    /reviewRound is managed by review handoff/,
  )
})

test('explicit duplicate batch ids are rejected', () => {
  const state = createEmptyState()
  const project = registerProject(state, { name: 'Demo', rootPath: '/tmp/demo' })

  createBatch(state, { id: 'B-fixed', projectId: project.id, tasks: [{ id: 'T001' }] })
  assert.throws(
    () => createBatch(state, { id: 'B-fixed', projectId: project.id, tasks: [{ id: 'T002' }] }),
    /duplicate batch id: B-fixed/,
  )
})

test('adapter registry is provider-neutral and heartbeat updates liveness', () => {
  const state = createEmptyState()
  const adapter = registerAdapter(state, {
    id: 'builder-local',
    name: 'Local Builder',
    kind: 'builder',
    capabilities: ['code', 'terminal', 'code'],
  })

  assert.equal(adapter.status, 'offline')
  assert.deepEqual(adapter.capabilities, ['code', 'terminal'])
  assert.equal(adapter.lastSeenAt, null)

  const heartbeated = heartbeatAdapter(state, adapter.id, { status: 'busy' })
  assert.equal(heartbeated.status, 'busy')
  assert.ok(heartbeated.lastSeenAt)
})

test('adapter registry rejects duplicate ids and unknown kinds/statuses', () => {
  const state = createEmptyState()
  registerAdapter(state, { id: 'reviewer-local', name: 'Reviewer', kind: 'reviewer' })

  assert.throws(
    () => registerAdapter(state, { id: 'reviewer-local', name: 'Duplicate', kind: 'reviewer' }),
    /duplicate adapter id/,
  )
  assert.throws(
    () => registerAdapter(state, { name: 'Unknown', kind: 'browser' }),
    /invalid adapter kind/,
  )
  assert.throws(
    () => heartbeatAdapter(state, 'reviewer-local', { status: 'sleeping' }),
    /invalid adapter status/,
  )
})

function sessionFixture() {
  const state = createEmptyState()
  const project = registerProject(state, { name: 'Demo', rootPath: '/tmp/demo' })
  const batch = createBatch(state, { projectId: project.id, tasks: [{ id: 'T001' }] })
  const builder = registerAdapter(state, { id: 'builder-local', name: 'Builder', kind: 'builder' })
  const reviewer = registerAdapter(state, { id: 'reviewer-local', name: 'Reviewer', kind: 'reviewer' })
  return { state, project, batch, builder, reviewer }
}

test('session binds a compatible adapter to an existing task and preserves history', () => {
  const { state, project, batch, builder } = sessionFixture()
  const session = createSession(state, {
    id: 'S-builder-1',
    role: 'builder',
    adapterId: builder.id,
    projectId: project.id,
    batchId: batch.id,
    taskId: 'T001',
  })

  assert.equal(session.status, 'starting')
  assert.equal(batch.tasks[0].builderSessionId, session.id)
  updateSession(state, session.id, { status: 'running', externalSessionId: 'external-42' })
  assert.ok(session.startedAt)
  assert.equal(session.externalSessionId, 'external-42')
  updateSession(state, session.id, { status: 'completed' })
  assert.ok(session.endedAt)
  assert.equal(state.sessions.length, 1)

  const next = createSession(state, {
    id: 'S-builder-2',
    role: 'builder',
    adapterId: builder.id,
    projectId: project.id,
    batchId: batch.id,
    taskId: 'T001',
  })
  assert.equal(batch.tasks[0].builderSessionId, next.id)
  assert.equal(state.sessions.length, 2)
})

test('session lifecycle rejects incompatible adapters, duplicate active roles and invalid transitions', () => {
  const { state, project, batch, builder, reviewer } = sessionFixture()

  assert.throws(() => createSession(state, {
    role: 'builder',
    adapterId: reviewer.id,
    projectId: project.id,
    batchId: batch.id,
    taskId: 'T001',
  }), /incompatible/)

  const session = createSession(state, {
    role: 'builder',
    adapterId: builder.id,
    projectId: project.id,
    batchId: batch.id,
    taskId: 'T001',
  })
  assert.throws(() => createSession(state, {
    role: 'builder',
    adapterId: builder.id,
    projectId: project.id,
    batchId: batch.id,
    taskId: 'T001',
  }), /active builder session already exists/)

  assert.throws(() => updateSession(state, session.id, { status: 'waiting' }), /invalid session transition/)
  updateSession(state, session.id, { status: 'running' })
  updateSession(state, session.id, { status: 'failed' })
  assert.throws(() => updateSession(state, session.id, { status: 'running' }), /invalid session transition/)
})

function reviewFixture() {
  const state = createEmptyState()
  const project = registerProject(state, { name: 'Review Demo', rootPath: '/tmp/review-demo' })
  const batch = createBatch(state, { projectId: project.id, tasks: [{ id: 'T001' }] })
  const reviewer = registerAdapter(state, { id: 'reviewer-local', name: 'Reviewer', kind: 'reviewer' })
  const reviewerSession = createSession(state, {
    id: 'S-reviewer-1',
    role: 'reviewer',
    adapterId: reviewer.id,
    projectId: project.id,
    batchId: batch.id,
    taskId: 'T001',
  })
  updateSession(state, reviewerSession.id, { status: 'running' })
  updateTask(state, batch.id, 'T001', { currentSha: 'abc' })
  return { state, project, batch, reviewerSession }
}

test('valid review handoff binds a reviewer session and exact task SHA', () => {
  const { state, project, batch, reviewerSession } = reviewFixture()
  const review = createReviewHandoff(state, {
    id: 'R-1',
    projectId: project.id,
    batchId: batch.id,
    taskId: 'T001',
    reviewerSessionId: reviewerSession.id,
    sha: 'abc',
  })

  assert.equal(review.status, 'requested')
  assert.equal(review.round, 1)
  assert.equal(batch.tasks[0].status, 'reviewing')
  assert.equal(batch.tasks[0].reviewerSessionId, reviewerSession.id)

  const result = resolveReviewHandoff(state, review.id, { result: 'passed', reviewedSha: 'abc' })
  assert.equal(result.status, 'passed')
  assert.equal(result.actionable, true)
  assert.equal(batch.tasks[0].status, 'review_passed')
  assert.equal(batch.tasks[0].reviewedSha, 'abc')
})

test('review rounds derive from durable review history, not mutable task projection', () => {
  const { state, project, batch, reviewerSession } = reviewFixture()
  const first = createReviewHandoff(state, {
    projectId: project.id,
    batchId: batch.id,
    taskId: 'T001',
    reviewerSessionId: reviewerSession.id,
    sha: 'abc',
  })
  assert.equal(first.round, 1)
  resolveReviewHandoff(state, first.id, { result: 'cancelled' })

  // Simulate a corrupted/legacy task projection. New rounds must still follow review history.
  batch.tasks[0].reviewRound = 99
  const second = createReviewHandoff(state, {
    projectId: project.id,
    batchId: batch.id,
    taskId: 'T001',
    reviewerSessionId: reviewerSession.id,
    sha: 'abc',
  })
  assert.equal(second.round, 2)
  assert.equal(batch.tasks[0].reviewRound, 2)
})

test('review result rejects a SHA different from the requested SHA', () => {
  const { state, project, batch, reviewerSession } = reviewFixture()
  const review = createReviewHandoff(state, {
    projectId: project.id,
    batchId: batch.id,
    taskId: 'T001',
    reviewerSessionId: reviewerSession.id,
    sha: 'abc',
  })

  assert.throws(
    () => resolveReviewHandoff(state, review.id, { result: 'passed', reviewedSha: 'def' }),
    /reviewedSha must match review requestedSha/,
  )
})

test('changing current SHA invalidates an earlier pass while preserving review history', () => {
  const { state, project, batch, reviewerSession } = reviewFixture()
  const review = createReviewHandoff(state, {
    projectId: project.id,
    batchId: batch.id,
    taskId: 'T001',
    reviewerSessionId: reviewerSession.id,
    sha: 'abc',
  })
  resolveReviewHandoff(state, review.id, { result: 'passed', reviewedSha: 'abc' })

  updateTask(state, batch.id, 'T001', { currentSha: 'def' })

  assert.equal(batch.tasks[0].status, 'stale')
  assert.equal(batch.tasks[0].reviewedSha, null)
  assert.equal(state.reviews.length, 1)
  assert.equal(review.status, 'passed')
  assert.equal(review.actionable, false)
  assert.ok(review.invalidatedAt)
})

test('a review resolved after task SHA changed is recorded but non-actionable', () => {
  const { state, project, batch, reviewerSession } = reviewFixture()
  const review = createReviewHandoff(state, {
    projectId: project.id,
    batchId: batch.id,
    taskId: 'T001',
    reviewerSessionId: reviewerSession.id,
    sha: 'abc',
  })

  updateTask(state, batch.id, 'T001', { currentSha: 'def' })
  resolveReviewHandoff(state, review.id, { result: 'passed', reviewedSha: 'abc' })

  assert.equal(review.status, 'passed')
  assert.equal(review.actionable, false)
  assert.notEqual(batch.tasks[0].status, 'review_passed')
  assert.equal(batch.tasks[0].reviewedSha, null)
})

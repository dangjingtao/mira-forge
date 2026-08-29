import assert from 'node:assert/strict'
import test from 'node:test'
import { createBatch, heartbeatAdapter, registerAdapter, registerProject, updateTask } from './domain.mjs'
import { createEmptyState } from './store.mjs'

test('project, batch and task runtime state form the minimal pipeline', () => {
  const state = createEmptyState()
  const project = registerProject(state, { name: 'Demo', rootPath: '/tmp/demo' })
  const batch = createBatch(state, { projectId: project.id, tasks: [{ id: 'T001', title: 'Build control plane' }] })

  updateTask(state, batch.id, 'T001', { status: 'building', builder: 'opencode' })
  assert.equal(batch.status, 'active')

  updateTask(state, batch.id, 'T001', { status: 'reviewing', reviewRound: 1, currentSha: 'abc' })
  assert.equal(batch.status, 'reviewing')

  updateTask(state, batch.id, 'T001', { status: 'review_passed', reviewedSha: 'abc' })
  assert.equal(batch.status, 'waiting_integration')
})

test('invalid runtime status is rejected', () => {
  const state = createEmptyState()
  const project = registerProject(state, { name: 'Demo', rootPath: '/tmp/demo' })
  const batch = createBatch(state, { projectId: project.id, tasks: [{ id: 'T001' }] })
  assert.throws(() => updateTask(state, batch.id, 'T001', { status: 'done-ish' }), /invalid task status/)
})

test('review_passed requires reviewed SHA bound to current SHA', () => {
  const state = createEmptyState()
  const project = registerProject(state, { name: 'Demo', rootPath: '/tmp/demo' })
  const batch = createBatch(state, { projectId: project.id, tasks: [{ id: 'T001' }] })

  updateTask(state, batch.id, 'T001', { status: 'reviewing', currentSha: 'abc' })
  assert.throws(
    () => updateTask(state, batch.id, 'T001', { status: 'review_passed' }),
    /reviewedSha is required/,
  )
  assert.throws(
    () => updateTask(state, batch.id, 'T001', { status: 'review_passed', reviewedSha: 'def' }),
    /reviewedSha must match currentSha/,
  )

  updateTask(state, batch.id, 'T001', { status: 'review_passed', reviewedSha: 'abc' })
  assert.throws(
    () => updateTask(state, batch.id, 'T001', { currentSha: 'def' }),
    /reviewedSha must match currentSha/,
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

import assert from 'node:assert/strict'
import test from 'node:test'
import { createBatch, registerProject, updateTask } from './domain.mjs'
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

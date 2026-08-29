import assert from 'node:assert/strict'
import test from 'node:test'
import { createBatch, createSession, registerAdapter, registerProject, updateTask } from './domain.mjs'
import { getDispatchReadiness, validateBatchDependencies } from './readiness.mjs'
import { createEmptyState } from './store.mjs'

function projectState() {
  const state = createEmptyState()
  const project = registerProject(state, { name: 'Dispatch Demo', rootPath: '/tmp/dispatch-demo' })
  return { state, project }
}

test('dependency validation rejects missing, self and cyclic references', () => {
  {
    const { state, project } = projectState()
    const batch = createBatch(state, {
      projectId: project.id,
      tasks: [{ id: 'T001', dependsOn: ['T999'] }],
    })
    assert.throws(() => validateBatchDependencies(batch), /dependency T999 not found/)
  }

  {
    const { state, project } = projectState()
    const batch = createBatch(state, {
      projectId: project.id,
      tasks: [{ id: 'T001', dependsOn: ['T001'] }],
    })
    assert.throws(() => validateBatchDependencies(batch), /cannot depend on itself/)
  }

  {
    const { state, project } = projectState()
    const batch = createBatch(state, {
      projectId: project.id,
      tasks: [
        { id: 'T001', dependsOn: ['T002'] },
        { id: 'T002', dependsOn: ['T001'] },
      ],
    })
    assert.throws(() => validateBatchDependencies(batch), /cyclic task dependencies/)
  }
})

test('readiness reports independent tasks together and waits for integrated dependencies', () => {
  const { state, project } = projectState()
  const batch = createBatch(state, {
    projectId: project.id,
    tasks: [
      { id: 'T001', title: 'Foundation' },
      { id: 'T002', title: 'Dependent', dependsOn: ['T001'] },
      { id: 'T003', title: 'Independent' },
    ],
  })
  validateBatchDependencies(batch)

  const initial = getDispatchReadiness(state, batch.id)
  assert.deepEqual(initial.ready.map((task) => task.taskId), ['T001', 'T003'])
  assert.equal(initial.blocked.find((task) => task.taskId === 'T002').reasons[0].code, 'dependency_not_integrated')

  updateTask(state, batch.id, 'T001', { status: 'integrated' })
  const afterIntegration = getDispatchReadiness(state, batch.id)
  assert.deepEqual(afterIntegration.ready.map((task) => task.taskId), ['T002', 'T003'])
})

test('an active builder session blocks dispatch readiness', () => {
  const { state, project } = projectState()
  const batch = createBatch(state, { projectId: project.id, tasks: [{ id: 'T001' }] })
  const builder = registerAdapter(state, { id: 'builder-local', name: 'Builder', kind: 'builder' })
  const session = createSession(state, {
    id: 'S-active-builder',
    role: 'builder',
    adapterId: builder.id,
    projectId: project.id,
    batchId: batch.id,
    taskId: 'T001',
  })

  const readiness = getDispatchReadiness(state, batch.id)
  assert.equal(readiness.ready.length, 0)
  const reason = readiness.blocked[0].reasons.find((item) => item.code === 'active_builder_session')
  assert.equal(reason.sessionId, session.id)
})

test('fixing tasks are dispatchable when dependencies are satisfied and no builder is active', () => {
  const { state, project } = projectState()
  const batch = createBatch(state, { projectId: project.id, tasks: [{ id: 'T001' }] })
  updateTask(state, batch.id, 'T001', { status: 'fixing' })

  const readiness = getDispatchReadiness(state, batch.id)
  assert.deepEqual(readiness.ready.map((task) => task.taskId), ['T001'])
})

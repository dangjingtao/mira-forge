import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  configureProjectTaskSource,
  createProjectBatch,
  inspectProjectTaskSource,
  resolveProjectTask,
} from './project-task-actions.mjs'

function memoryStore(initial) {
  const state = structuredClone(initial)
  return {
    async read() {
      return structuredClone(state)
    },
    async mutate(mutator) {
      const result = await mutator(state)
      return structuredClone(result)
    },
    state,
  }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'mira-forge-project-actions-'))
  const taskDir = join(root, 'docs', 'tasks')
  await mkdir(taskDir, { recursive: true })
  await writeFile(join(root, 'TASKS.md'), [
    '| ID | Task | Status |',
    '| --- | --- | --- |',
    '| T100 | First task | TODO |',
    '| T101 | Second task | REVIEW |',
    '',
  ].join('\n'))
  await writeFile(join(taskDir, 'T100-first-task.md'), '# T100 — First task\n\nStatus: TODO\n')
  await writeFile(join(taskDir, 'T101-second-task.md'), '# T101 — Second task\n\nStatus: REVIEW\n')
  return root
}

test('project task actions expose authoritative task refs and create a runtime batch', async (t) => {
  const root = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  const store = memoryStore({
    projects: [{
      id: 'project-1',
      name: 'Fixture',
      rootPath: root,
      repository: null,
      integrationBranch: 'dev',
      taskLedger: 'TASKS.md',
      taskDir: 'docs/tasks',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }],
    batches: [],
  })

  const source = await inspectProjectTaskSource(store, 'project-1')
  assert.deepEqual(source.tasks.map((task) => task.id), ['T100', 'T101'])

  const resolved = await resolveProjectTask(store, 'project-1', 'T100')
  assert.equal(resolved.taskRef, 'docs/tasks/T100-first-task.md')

  const batch = await createProjectBatch(store, 'project-1', { name: 'Smoke', taskIds: ['T100'] })
  assert.equal(batch.name, 'Smoke')
  assert.equal(batch.tasks[0].id, 'T100')
  assert.equal(batch.tasks[0].title, 'First task')
  assert.equal(batch.tasks[0].status, 'waiting')

  await assert.rejects(
    createProjectBatch(store, 'project-1', { taskIds: ['T100'] }),
    /already exists in an active batch/,
  )
})

test('task-source configuration validates before it is persisted', async (t) => {
  const root = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  const store = memoryStore({
    projects: [{
      id: 'project-1',
      name: 'Fixture',
      rootPath: root,
      repository: null,
      integrationBranch: 'dev',
      taskLedger: null,
      taskDir: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }],
    batches: [],
  })

  await assert.rejects(
    configureProjectTaskSource(store, 'project-1', { taskLedger: 'missing.md', taskDir: 'docs/tasks' }),
    /task ledger is unavailable/,
  )
  assert.equal(store.state.projects[0].taskLedger, null)

  const result = await configureProjectTaskSource(store, 'project-1', {
    taskLedger: 'TASKS.md',
    taskDir: 'docs/tasks',
  })
  assert.equal(result.project.taskLedger, 'TASKS.md')
  assert.equal(result.source.tasks.length, 2)
})

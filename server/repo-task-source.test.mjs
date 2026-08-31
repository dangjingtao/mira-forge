import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { registerProject } from './domain.mjs'
import { createRepositoryTask, inspectRepositoryTaskSource, resolveRepositoryTask, updateRepositoryTask } from './repo-task-source.mjs'
import { createEmptyState } from './store.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'mira-forge-task-source-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'docs/workbench/tasks'), { recursive: true })
  await writeFile(join(root, 'docs/workbench/00-work-ledger.md'), [
    '# Work Ledger',
    '',
    '| ID | Task | Status | Evidence |',
    '| --- | --- | --- | --- |',
    '| T001 | Existing task | TODO | existing evidence |',
    '',
  ].join('\n'), 'utf8')
  await writeFile(join(root, 'docs/workbench/tasks/T001-existing-task.md'), '# T001 — Existing task\n\nStatus: TODO\n\n## Goal\nKeep truth in repo.\n', 'utf8')
  return {
    root,
    project: {
      id: 'P1',
      rootPath: root,
      taskLedger: 'docs/workbench/00-work-ledger.md',
      taskDir: 'docs/workbench/tasks',
    },
  }
}

test('inspects configured repository task source without mutating project truth', async (t) => {
  const { project } = await fixture(t)
  const source = await inspectRepositoryTaskSource(project)
  assert.deepEqual(source, {
    kind: 'repository-markdown',
    ledgerRef: 'docs/workbench/00-work-ledger.md',
    taskDirRef: 'docs/workbench/tasks',
    tasks: [{ id: 'T001', title: 'Existing task', status: 'TODO' }],
  })
})

test('resolves a repository ledger task to a small normalized task-card reference', async (t) => {
  const { project } = await fixture(t)
  const task = await resolveRepositoryTask(project, 'T001')
  assert.deepEqual(task, {
    id: 'T001',
    title: 'Existing task',
    status: 'TODO',
    cardStatus: 'TODO',
    taskRef: 'docs/workbench/tasks/T001-existing-task.md',
    ledgerRef: 'docs/workbench/00-work-ledger.md',
    warnings: [],
  })
})

test('explicit create and update mutate repository truth and read back without runtime copies', async (t) => {
  const { project } = await fixture(t)
  const runtimeState = createEmptyState()
  const registered = registerProject(runtimeState, { name: 'Fixture', ...project })
  const marker = 'task-source-body-must-not-enter-runtime-state'

  const created = await createRepositoryTask(registered, {
    id: 'T002',
    title: 'Second task',
    status: 'TODO',
    body: `## Goal\n${marker}`,
  })
  assert.equal(created.status, 'TODO')
  assert.equal(created.taskRef, 'docs/workbench/tasks/T002-second-task.md')

  const updated = await updateRepositoryTask(registered, 'T002', { status: 'REVIEW', title: 'Second task refined' })
  assert.equal(updated.status, 'REVIEW')
  assert.equal(updated.cardStatus, 'REVIEW')
  assert.equal(updated.title, 'Second task refined')

  const ledger = await readFile(join(registered.rootPath, registered.taskLedger), 'utf8')
  const card = await readFile(join(registered.rootPath, created.taskRef), 'utf8')
  assert.match(ledger, /\| T002 \| Second task refined \| REVIEW \|  \|/)
  assert.match(card, /^# T002 — Second task refined/m)
  assert.match(card, /^Status: REVIEW$/m)
  assert.match(card, new RegExp(marker))
  assert.equal(JSON.stringify(runtimeState).includes(marker), false)
  assert.equal(JSON.stringify(runtimeState).includes('Second task refined'), false)
})

test('full explicit card content can be created and later replaced while the ledger stays indexed', async (t) => {
  const { project } = await fixture(t)
  await createRepositoryTask(project, {
    id: 'T003',
    content: '# T003 — Contract task\n\nStatus: TODO\n\n## Acceptance\n- first\n',
  })
  const updated = await updateRepositoryTask(project, 'T003', {
    content: '# T003 — Contract task revised\n\nStatus: DOING\n\n## Acceptance\n- second\n',
  })
  assert.equal(updated.title, 'Contract task revised')
  assert.equal(updated.status, 'DOING')
  const card = await readFile(join(project.rootPath, updated.taskRef), 'utf8')
  assert.match(card, /- second/)
})

test('bounded errors reject missing configuration, malformed ledgers and missing task cards', async (t) => {
  const { root, project } = await fixture(t)
  await assert.rejects(() => resolveRepositoryTask({ rootPath: root }, 'T001'), /project\.taskLedger is required/)

  await writeFile(join(root, 'docs/workbench/00-work-ledger.md'), '| Nope | State |\n| --- | --- |\n| T001 | TODO |\n', 'utf8')
  await assert.rejects(() => resolveRepositoryTask(project, 'T001'), /ID, Task and Status columns/)

  await writeFile(join(root, 'docs/workbench/00-work-ledger.md'), '| ID | Task | Status |\n| --- | --- | --- |\n| T404 | Missing card | TODO |\n', 'utf8')
  await assert.rejects(() => resolveRepositoryTask(project, 'T404'), /task card not found/)
})

test('configured paths and task IDs cannot escape the registered project workspace', async (t) => {
  const { root, project } = await fixture(t)
  await assert.rejects(
    () => resolveRepositoryTask({ ...project, taskLedger: '../outside.md' }, 'T001'),
    /escapes project root/,
  )
  await assert.rejects(() => resolveRepositoryTask(project, '../T001'), /unsupported characters/)
  assert.ok(root)
})

test('ledger parsing preserves escaped pipe content in unrelated columns', async (t) => {
  const { root, project } = await fixture(t)
  await writeFile(join(root, project.taskLedger), [
    '| ID | Task | Status | Evidence |',
    '| --- | --- | --- | --- |',
    '| T001 | Existing task | TODO | left \\| right |',
    '',
  ].join('\n'), 'utf8')
  await updateRepositoryTask(project, 'T001', { status: 'REVIEW' })
  const ledger = await readFile(join(root, project.taskLedger), 'utf8')
  assert.match(ledger, /left \\| right/)
})

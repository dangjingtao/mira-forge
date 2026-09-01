import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createMainThreadManager } from './main-thread-manager.mjs'
import { createStore } from './store.mjs'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'mira-forge-main-thread-'))
  const taskDir = join(root, 'docs', 'tasks')
  await mkdir(taskDir, { recursive: true })
  await writeFile(join(root, 'docs', 'ledger.md'), [
    '# Work Ledger',
    '',
    '| ID | Task | Status | Evidence |',
    '| --- | --- | --- | --- |',
    '| T001 | Existing task | PASS | fixture |',
    '',
  ].join('\n'), 'utf8')
  await writeFile(join(taskDir, 'T001-existing-task.md'), [
    '# T001 — Existing task',
    '',
    'Status: PASS',
    '',
    'Fixture body.',
    '',
  ].join('\n'), 'utf8')

  const stateFile = join(root, '.forge-state.json')
  const store = createStore(stateFile)
  await store.mutate((state) => {
    state.projects.push({
      id: 'p1',
      name: 'Fixture Project',
      rootPath: root,
      repository: 'example/fixture',
      taskLedger: 'docs/ledger.md',
      taskDir: 'docs/tasks',
      integrationBranch: 'dev',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  })
  return { root, stateFile, store }
}

function fakeAdapter(id) {
  return {
    id,
    async runTurn(input) {
      return {
        externalThreadId: input.externalThreadId || `${id}-thread-1`,
        responseText: `${id} reply`,
        events: [{
          type: 'tool',
          tool: { name: 'read', status: 'completed' },
          provider: { adapter: id, eventType: 'fixture.tool', itemType: 'read' },
        }],
        providerEventType: `${id}.turn.completed`,
      }
    },
  }
}

function adapters() {
  return new Map([
    ['opencode', fakeAdapter('opencode')],
    ['codex', fakeAdapter('codex')],
  ])
}

async function conventionalFixture() {
  const root = await mkdtemp(join(tmpdir(), 'mira-forge-main-thread-default-source-'))
  const taskDir = join(root, 'docs', 'workbench', 'tasks')
  await mkdir(taskDir, { recursive: true })
  await writeFile(join(root, 'docs', 'workbench', '00-work-ledger.md'), [
    '# Work Ledger',
    '',
    '| ID | Task | Status | Evidence |',
    '| --- | --- | --- | --- |',
    '| T001 | Conventional task | REVIEW | fixture |',
    '',
  ].join('\n'), 'utf8')
  await writeFile(join(taskDir, 'T001-conventional-task.md'), [
    '# T001 — Conventional task',
    '',
    'Status: REVIEW',
    '',
  ].join('\n'), 'utf8')

  const store = createStore(join(root, 'state.json'))
  await store.mutate((state) => {
    state.projects.push({
      id: 'p1',
      name: 'Conventional Project',
      rootPath: root,
      repository: null,
      taskLedger: null,
      taskDir: null,
      integrationBranch: 'dev',
    })
  })
  return { root, store }
}

test('registered projects can keep durable main threads for OpenCode and Codex', async () => {
  for (const adapter of ['opencode', 'codex']) {
    const { stateFile, store } = await fixture()
    const manager = createMainThreadManager({ store, adapters: adapters() })
    const thread = await manager.openThread({ projectId: 'p1', adapter })
    const snapshot = await manager.sendMessage(thread.id, { message: 'What is the current project state?' })

    assert.equal(snapshot.thread.adapter, adapter)
    assert.equal(snapshot.thread.status, 'idle')
    assert.equal(snapshot.thread.externalThreadId, `${adapter}-thread-1`)
    assert.equal(snapshot.events.some((event) => event.role === 'user'), true)
    assert.equal(snapshot.events.some((event) => event.role === 'assistant' && event.text === `${adapter} reply`), true)

    const restarted = createMainThreadManager({ store: createStore(stateFile), adapters: adapters() })
    const replay = await restarted.getThread(thread.id)
    assert.equal(replay.thread.externalThreadId, `${adapter}-thread-1`)
    assert.equal(replay.events.some((event) => event.role === 'assistant'), true)

    const second = await restarted.sendMessage(thread.id, { message: 'Continue from that context.' })
    assert.equal(second.thread.externalThreadId, `${adapter}-thread-1`)
  }
})

test('main thread and Batch paths share conventional repository task-source defaults', async () => {
  const { store } = await conventionalFixture()
  let prompt = ''
  const adapter = {
    id: 'opencode',
    async runTurn(input) {
      prompt = input.message
      return {
        externalThreadId: 'default-source-thread',
        responseText: 'done',
        events: [],
        providerEventType: 'opencode.turn.completed',
      }
    },
  }
  const manager = createMainThreadManager({ store, adapters: new Map([['opencode', adapter]]) })
  const thread = await manager.openThread({ projectId: 'p1', adapter: 'opencode' })

  await manager.sendMessage(thread.id, { message: 'inspect project tasks' })
  assert.match(prompt, /Ledger: docs\/workbench\/00-work-ledger\.md/)
  assert.match(prompt, /Task dir: docs\/workbench\/tasks/)
  assert.match(prompt, /T001 \[REVIEW\] Conventional task/)

  const source = await manager.inspectTasks(thread.id)
  assert.equal(source.tasks.length, 1)
  const resolved = await manager.resolveTask(thread.id, 'T001')
  assert.equal(resolved.taskRef, 'docs/workbench/tasks/T001-conventional-task.md')

  const created = await manager.createTask(thread.id, { id: 'T002', title: 'Created by main thread', status: 'TODO' })
  assert.equal(created.taskRef, 'docs/workbench/tasks/T002-created-by-main-thread.md')
  const updated = await manager.updateTask(thread.id, 'T002', { status: 'REVIEW' })
  assert.equal(updated.status, 'REVIEW')
  const handoff = await manager.createHandoff(thread.id, { taskId: 'T001', preferredBuilder: 'opencode' })
  assert.equal(handoff.handoff.taskRef, 'docs/workbench/tasks/T001-conventional-task.md')
})

test('provider progress is durable while a main-thread turn is still running', async () => {
  const { store } = await fixture()
  let releaseTurn
  let progressPersisted
  const release = new Promise((resolve) => { releaseTurn = resolve })
  const observed = new Promise((resolve) => { progressPersisted = resolve })
  const liveAdapter = {
    id: 'opencode',
    async runTurn(input) {
      await input.onEvent({
        type: 'thinking',
        text: 'checking repository task state',
        provider: { adapter: 'opencode', eventType: 'fixture.reasoning', itemType: 'reasoning' },
      })
      progressPersisted()
      await release
      return {
        externalThreadId: 'opencode-live-1',
        responseText: 'done',
        events: [],
        providerEventType: 'opencode.turn.completed',
      }
    },
  }
  const manager = createMainThreadManager({
    store,
    adapters: new Map([['opencode', liveAdapter]]),
  })
  const thread = await manager.openThread({ projectId: 'p1', adapter: 'opencode' })
  const pending = manager.sendMessage(thread.id, { message: 'inspect' })

  await observed
  const live = await manager.getThread(thread.id)
  assert.equal(live.thread.status, 'running')
  assert.equal(live.events.some((event) => event.type === 'thinking' && event.text === 'checking repository task state'), true)

  releaseTurn()
  const completed = await pending
  assert.equal(completed.thread.status, 'idle')
  assert.equal(completed.events.filter((event) => event.type === 'thinking').length, 1)
})

test('main thread task capabilities use repository truth without copying Task Card bodies into Forge state', async () => {
  const { root, stateFile, store } = await fixture()
  const manager = createMainThreadManager({ store, adapters: adapters() })
  const thread = await manager.openThread({ projectId: 'p1', adapter: 'opencode' })
  const marker = 'TASK-BODY-MUST-STAY-IN-REPOSITORY'

  const created = await manager.createTask(thread.id, {
    id: 'T002',
    title: 'Second task',
    status: 'TODO',
    body: marker,
  })
  assert.equal(created.id, 'T002')
  assert.equal(created.taskRef, 'docs/tasks/T002-second-task.md')

  const readBack = await manager.resolveTask(thread.id, 'T002')
  assert.equal(readBack.title, 'Second task')
  assert.equal(readBack.status, 'TODO')

  const updated = await manager.updateTask(thread.id, 'T002', { status: 'REVIEW' })
  assert.equal(updated.status, 'REVIEW')

  const card = await readFile(join(root, created.taskRef), 'utf8')
  assert.match(card, new RegExp(marker))
  const durableState = await readFile(stateFile, 'utf8')
  assert.equal(durableState.includes(marker), false)
  assert.equal(durableState.includes('"content"'), false)
})

test('dispatch handoff references repository Task Card and does not auto-dispatch', async () => {
  const { store } = await fixture()
  const manager = createMainThreadManager({ store, adapters: adapters() })
  const thread = await manager.openThread({ projectId: 'p1', adapter: 'codex' })

  const handoff = await manager.createHandoff(thread.id, {
    taskId: 'T001',
    preferredBuilder: 'opencode-local',
  })
  assert.deepEqual(handoff.handoff, {
    projectId: 'p1',
    taskId: 'T001',
    taskRef: 'docs/tasks/T001-existing-task.md',
    preferredBuilder: 'opencode-local',
  })

  const state = await store.read()
  assert.deepEqual(state.dispatches, [])
  assert.equal(state.threadEvents.some((event) => event.type === 'handoff'), true)
})

test('main thread can chat even when repository task source is not configured', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mira-forge-main-thread-no-task-source-'))
  const store = createStore(join(root, 'state.json'))
  await store.mutate((state) => {
    state.projects.push({
      id: 'p1',
      name: 'No Ledger',
      rootPath: root,
      repository: null,
      taskLedger: null,
      taskDir: null,
      integrationBranch: 'dev',
    })
  })

  const manager = createMainThreadManager({ store, adapters: adapters() })
  const thread = await manager.openThread({ projectId: 'p1', adapter: 'opencode' })
  const snapshot = await manager.sendMessage(thread.id, { message: 'hello' })
  assert.equal(snapshot.events.some((event) => event.text === 'opencode reply'), true)
  await assert.rejects(() => manager.inspectTasks(thread.id), /task ledger is unavailable/)
})

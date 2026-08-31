import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createStore } from './store.mjs'

test('store persists state atomically', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mira-forge-'))
  const file = join(dir, 'state.json')
  const store = createStore(file)

  await store.mutate((state) => {
    state.projects.push({ id: 'p1' })
  })

  const state = await store.read()
  assert.equal(state.schemaVersion, 1)
  assert.equal(state.projects[0].id, 'p1')
  assert.deepEqual(state.adapters, [])
  assert.deepEqual(state.sessions, [])
  assert.deepEqual(state.reviews, [])
  assert.deepEqual(state.dispatches, [])
  assert.deepEqual(state.events, [])
  assert.deepEqual(state.threads, [])
  assert.deepEqual(state.threadEvents, [])

  const raw = await readFile(file, 'utf8')
  assert.doesNotThrow(() => JSON.parse(raw))
})

test('schema-1 state without additive runtime arrays remains readable', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mira-forge-legacy-'))
  const file = join(dir, 'state.json')
  await writeFile(file, JSON.stringify({ schemaVersion: 1, projects: [], batches: [] }), 'utf8')

  const state = await createStore(file).read()
  assert.deepEqual(state.adapters, [])
  assert.deepEqual(state.sessions, [])
  assert.deepEqual(state.reviews, [])
  assert.deepEqual(state.dispatches, [])
  assert.deepEqual(state.events, [])
  assert.deepEqual(state.threads, [])
  assert.deepEqual(state.threadEvents, [])
})

test('schema-1 state rejects malformed additive dispatch arrays', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mira-forge-invalid-dispatch-'))
  const file = join(dir, 'state.json')
  await writeFile(file, JSON.stringify({
    schemaVersion: 1,
    projects: [],
    batches: [],
    dispatches: {},
    events: [],
  }), 'utf8')

  await assert.rejects(() => createStore(file).read(), /Unsupported or invalid Mira Forge state file/)
})

test('schema-1 state rejects malformed main-thread arrays', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mira-forge-invalid-thread-'))
  const file = join(dir, 'state.json')
  await writeFile(file, JSON.stringify({
    schemaVersion: 1,
    projects: [],
    batches: [],
    threads: {},
    threadEvents: [],
  }), 'utf8')

  await assert.rejects(() => createStore(file).read(), /Unsupported or invalid Mira Forge state file/)
})

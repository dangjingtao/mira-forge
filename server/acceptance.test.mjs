import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createOpenCodeAcceptance, MARKER_CONTENT, MARKER_FILE } from './acceptance.mjs'

test('OpenCode first-run check passes only with session binding and verified disposable marker', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'mira-forge-acceptance-test-'))
  try {
    const runner = {
      start(input) {
        input.onStarted?.({ pid: 4321 })
        queueMicrotask(async () => {
          input.onEvent?.({ sessionID: 'ses_acceptance_ok' })
          await writeFile(join(input.projectRoot, MARKER_FILE), `${MARKER_CONTENT}\n`)
          input.onExit?.({ code: 0, signal: null, stderr: '', resultText: 'done' })
        })
        return { kill() { return true } }
      },
    }

    const check = createOpenCodeAcceptance({ runner, baseDir, timeoutMs: 1000 })
    const result = await check.run()

    assert.equal(result.ok, true)
    assert.equal(result.status, 'passed')
    assert.equal(result.externalSessionId, 'ses_acceptance_ok')
    assert.equal(result.pid, 4321)
    assert.equal(result.exitCode, 0)
    assert.equal(result.markerVerified, true)
    assert.equal(result.workspaceDisposable, true)
    assert.equal(check.active, false)
  } finally {
    await rm(baseDir, { recursive: true, force: true })
  }
})

test('OpenCode first-run check fails when session binding is missing', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'mira-forge-acceptance-test-'))
  try {
    const runner = {
      start(input) {
        queueMicrotask(async () => {
          await writeFile(join(input.projectRoot, MARKER_FILE), MARKER_CONTENT)
          input.onExit?.({ code: 0, signal: null, stderr: '', resultText: null })
        })
        return { kill() { return true } }
      },
    }

    const result = await createOpenCodeAcceptance({ runner, baseDir, timeoutMs: 1000 }).run()
    assert.equal(result.ok, false)
    assert.match(result.error, /sessionID/)
    assert.equal(result.markerVerified, true)
  } finally {
    await rm(baseDir, { recursive: true, force: true })
  }
})

test('OpenCode first-run check times out and terminates the disposable run', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'mira-forge-acceptance-test-'))
  let killed = false
  try {
    const runner = {
      start() {
        return { kill() { killed = true; return true } }
      },
    }

    const result = await createOpenCodeAcceptance({ runner, baseDir, timeoutMs: 20 }).run()
    assert.equal(result.ok, false)
    assert.match(result.error, /did not finish/)
    assert.equal(killed, true)
  } finally {
    await rm(baseDir, { recursive: true, force: true })
  }
})

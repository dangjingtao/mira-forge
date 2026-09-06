import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import {
  buildCodexMainThreadArgs,
  buildOpenCodeMainThreadArgs,
  createCodexMainThreadAdapter,
  createOpenCodeMainThreadAdapter,
} from './main-thread-adapters.mjs'

class FakeChild extends EventEmitter {
  constructor(lines, { code = 0, stderr = '' } = {}) {
    super()
    this.stdout = new PassThrough()
    this.stderr = new PassThrough()
    this.pid = 4321
    this.lines = lines
    this.code = code
    this.stderrText = stderr
  }

  run() {
    queueMicrotask(() => {
      if (this.stderrText) this.stderr.write(this.stderrText)
      for (const line of this.lines) this.stdout.write(`${JSON.stringify(line)}\n`)
      this.stdout.end()
      this.stderr.end()
      this.emit('close', this.code, null)
    })
  }

  kill() {
    return true
  }
}

function fakeSpawn(plan, capture) {
  return (bin, args, options) => {
    capture.push({ bin, args, options })
    const child = new FakeChild(plan.lines, plan)
    child.run()
    return child
  }
}

test('OpenCode main thread is pinned to plan, exposes thinking, and resumes by session ID', () => {
  assert.deepEqual(buildOpenCodeMainThreadArgs({
    projectRoot: '/repo',
    message: 'hello',
    externalThreadId: 'ses-7',
    model: 'openai/gpt-5',
  }), [
    'run', '--format', 'json', '--thinking', '--dir', '/repo', '--agent', 'plan',
    '--session', 'ses-7', '--model', 'openai/gpt-5', 'hello',
  ])
})

test('OpenCode main thread injects a read-oriented permission boundary and normalizes output', async () => {
  const capture = []
  const adapter = createOpenCodeMainThreadAdapter({
    spawnImpl: fakeSpawn({
      lines: [
        { type: 'step_start', sessionID: 'ses-1' },
        { type: 'part', sessionID: 'ses-1', part: { type: 'reasoning', text: 'inspect the ledger' } },
        { type: 'part', sessionID: 'ses-1', part: { type: 'tool', tool: 'read', state: { status: 'completed' } } },
        { type: 'part', sessionID: 'ses-1', part: { type: 'text', text: 'hello from opencode' } },
      ],
    }, capture),
    environment: { HOME: '/tmp/home' },
    timeoutMs: 1000,
  })

  const result = await adapter.runTurn({ projectRoot: '/repo', message: 'prompt' })

  assert.equal(result.externalThreadId, 'ses-1')
  assert.equal(result.responseText, 'hello from opencode')
  assert.equal(result.events[0].type, 'thinking')
  assert.equal(result.events[0].text, 'inspect the ledger')
  assert.equal(result.events[1].tool.name, 'read')
  const permissions = JSON.parse(capture[0].options.env.OPENCODE_PERMISSION)
  assert.equal(permissions.edit, undefined)
  assert.equal(permissions['*'], 'deny')
  assert.equal(permissions.read, 'allow')
  assert.equal(permissions.glob, 'allow')
})

test('OpenCode forwards normalized progress as it arrives without duplicating it in the final result', async () => {
  const streamed = []
  const adapter = createOpenCodeMainThreadAdapter({
    spawnImpl: fakeSpawn({
      lines: [
        { type: 'step_start', sessionID: 'ses-live' },
        { type: 'part', sessionID: 'ses-live', part: { type: 'reasoning', text: 'thinking live' } },
        { type: 'part', sessionID: 'ses-live', part: { type: 'tool', tool: 'grep', state: { status: 'completed' } } },
        { type: 'part', sessionID: 'ses-live', part: { type: 'text', text: 'done' } },
      ],
    }, []),
    timeoutMs: 1000,
  })

  const result = await adapter.runTurn({
    projectRoot: '/repo',
    message: 'prompt',
    onEvent: async (event) => streamed.push(event),
  })

  assert.deepEqual(streamed.map((event) => event.type), ['thinking', 'tool'])
  assert.deepEqual(result.events, [])
})

test('Codex main thread always requests non-interactive read-only execution', () => {
  assert.deepEqual(buildCodexMainThreadArgs({
    projectRoot: '/repo',
    message: 'continue',
    externalThreadId: 'thr-9',
    model: 'gpt-5.2-codex',
  }), [
    'exec', '--json', '--sandbox', 'read-only', '--ask-for-approval', 'never', '-C', '/repo',
    '--model', 'gpt-5.2-codex', 'resume', 'thr-9', 'continue',
  ])
})

test('Codex main thread normalizes a durable response and verifies resume identity', async () => {
  const adapter = createCodexMainThreadAdapter({
    spawnImpl: fakeSpawn({
      lines: [
        { type: 'thread.started', thread_id: 'thr-9' },
        { type: 'item.completed', item: { type: 'reasoning', summary: [{ text: 'read the project state' }] } },
        { type: 'item.completed', item: { type: 'command_execution', status: 'completed' } },
        { type: 'item.completed', item: { type: 'agent_message', text: 'hello from codex' } },
        { type: 'turn.completed', usage: { input_tokens: 2, output_tokens: 3 } },
      ],
    }, []),
    timeoutMs: 1000,
  })

  const result = await adapter.runTurn({
    projectRoot: '/repo',
    message: 'prompt',
    externalThreadId: 'thr-9',
  })

  assert.equal(result.externalThreadId, 'thr-9')
  assert.equal(result.responseText, 'hello from codex')
  assert.equal(result.events[0].type, 'thinking')
  assert.equal(result.events[0].text, 'read the project state')
  assert.equal(result.events[1].tool.name, 'command_execution')
})

test('Codex main thread rejects a resume that silently switches thread IDs', async () => {
  const adapter = createCodexMainThreadAdapter({
    spawnImpl: fakeSpawn({
      lines: [
        { type: 'thread.started', thread_id: 'unexpected-thread' },
        { type: 'item.completed', item: { type: 'agent_message', text: 'new thread by mistake' } },
      ],
    }, []),
    timeoutMs: 1000,
  })

  await assert.rejects(() => adapter.runTurn({
    projectRoot: '/repo',
    message: 'prompt',
    externalThreadId: 'wanted-thread',
  }), /requested thread ID/)
})

test('Codex main thread treats provider file-change events as a contract violation', async () => {
  const adapter = createCodexMainThreadAdapter({
    spawnImpl: fakeSpawn({
      lines: [
        { type: 'thread.started', thread_id: 'thr-1' },
        { type: 'item.completed', item: { type: 'file_change', status: 'completed' } },
        { type: 'item.completed', item: { type: 'agent_message', text: 'changed a file' } },
      ],
    }, []),
    timeoutMs: 1000,
  })

  await assert.rejects(() => adapter.runTurn({
    projectRoot: '/repo',
    message: 'prompt',
  }), /file-change attempt/)
})

import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import {
  buildCodexDesktopThreadRequest,
  buildCodexDesktopTurnRequest,
  codexDesktopBinaryCandidates,
  createCodexDesktopMainThreadAdapter,
  normalizeCodexDesktopNotification,
  resolveCodexDesktopBinary,
} from './codex-desktop-adapter.mjs'

class FakeAppServer extends EventEmitter {
  constructor(capture, threadId = 'thr-desktop-1') {
    super()
    this.stdin = new PassThrough()
    this.stdout = new PassThrough()
    this.stderr = new PassThrough()
    this.pid = 4321
    this.capture = capture
    this.threadId = threadId
    this.buffer = ''
    this.turnCount = 0
    this.stdin.on('data', (chunk) => this.consume(chunk.toString()))
    this.stdin.on('end', () => queueMicrotask(() => {
      this.capture.closed = (this.capture.closed || 0) + 1
      this.emit('close', 0, null)
    }))
  }

  write(message) {
    this.stdout.write(`${JSON.stringify(message)}\n`)
  }

  consume(chunk) {
    this.buffer += chunk
    const lines = this.buffer.split(/\r?\n/)
    this.buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      const message = JSON.parse(line)
      this.capture.messages.push(message)
      if (!Object.prototype.hasOwnProperty.call(message, 'id')) continue

      if (message.method === 'initialize') {
        this.write({ id: message.id, result: { codexHome: '/tmp/.codex' } })
      } else if (message.method === 'thread/start') {
        this.write({ id: message.id, result: { thread: { id: this.threadId } } })
      } else if (message.method === 'thread/resume') {
        if (this.capture.resumeError) {
          this.write({ id: message.id, error: { code: -32600, message: this.capture.resumeError } })
        } else {
          this.threadId = message.params.threadId
          this.write({ id: message.id, result: { thread: { id: message.params.threadId } } })
        }
      } else if (message.method === 'turn/start') {
        this.turnCount += 1
        const turnId = `turn-${this.turnCount}`
        this.write({ id: message.id, result: { turn: { id: turnId, status: 'inProgress', items: [], error: null } } })
        queueMicrotask(() => {
          this.write({
            method: 'item/started',
            params: {
              threadId: this.threadId,
              turnId,
              item: { id: `cmd-${this.turnCount}`, type: 'commandExecution', status: 'inProgress' },
            },
          })
          this.write({
            method: 'item/completed',
            params: {
              threadId: this.threadId,
              turnId,
              item: { id: `cmd-${this.turnCount}`, type: 'commandExecution', status: 'completed' },
            },
          })
          this.write({
            method: 'item/completed',
            params: {
              threadId: this.threadId,
              turnId,
              item: { id: `reason-${this.turnCount}`, type: 'reasoning', summary: [{ text: 'checked the repository ledger' }] },
            },
          })
          this.write({
            method: 'item/completed',
            params: {
              threadId: this.threadId,
              turnId,
              item: { id: `answer-${this.turnCount}`, type: 'agentMessage', text: 'T012 — TUI dispatch wiring' },
            },
          })
          this.write({
            method: 'turn/completed',
            params: {
              threadId: this.threadId,
              turn: { id: turnId, status: 'completed', error: null },
            },
          })
        })
      } else if (message.method === 'thread/unsubscribe') {
        this.write({ id: message.id, result: { status: 'unsubscribed' } })
      }
    }
  }

  kill() {
    queueMicrotask(() => this.emit('close', null, 'SIGTERM'))
    return true
  }
}

function fakeSpawn(capture) {
  return (bin, args, options) => {
    capture.calls.push({ bin, args, options })
    return new FakeAppServer(capture)
  }
}

test('Codex Desktop binary discovery covers current ChatGPT.app and legacy Codex.app', () => {
  const candidates = codexDesktopBinaryCandidates('/Users/test')
  assert.equal(candidates.includes('/Applications/ChatGPT.app/Contents/Resources/codex'), true)
  assert.equal(candidates.includes('/Applications/Codex.app/Contents/Resources/codex'), true)
  assert.equal(candidates.includes('/Users/test/Applications/ChatGPT.app/Contents/Resources/codex'), true)
})

test('Codex Desktop resolver chooses the first executable app bundle backend', async () => {
  const seen = []
  const resolved = await resolveCodexDesktopBinary({
    home: '/Users/test',
    platform: 'darwin',
    accessImpl: async (path) => {
      seen.push(path)
      if (path !== '/Applications/Codex.app/Contents/Resources/codex') throw new Error('missing')
    },
  })
  assert.equal(resolved, '/Applications/Codex.app/Contents/Resources/codex')
  assert.deepEqual(seen.slice(0, 2), [
    '/Applications/ChatGPT.app/Contents/Resources/codex',
    '/Applications/Codex.app/Contents/Resources/codex',
  ])
})

test('Codex Desktop thread and turn requests stay non-interactive and read-only', () => {
  assert.deepEqual(buildCodexDesktopThreadRequest({
    projectRoot: '/repo',
    externalThreadId: 'thr-9',
    model: 'gpt-5.6-sol',
  }), {
    method: 'thread/resume',
    params: {
      cwd: '/repo',
      approvalPolicy: 'never',
      sandbox: 'read-only',
      model: 'gpt-5.6-sol',
      threadId: 'thr-9',
      excludeTurns: true,
    },
  })
  assert.deepEqual(buildCodexDesktopTurnRequest({
    projectRoot: '/repo',
    threadId: 'thr-9',
    message: 'inspect only',
  }), {
    threadId: 'thr-9',
    input: [{ type: 'text', text: 'inspect only' }],
    cwd: '/repo',
    approvalPolicy: 'never',
    sandboxPolicy: { type: 'readOnly' },
  })
})

test('Codex Desktop normalizes app-server reasoning and execution events', () => {
  const reasoning = normalizeCodexDesktopNotification({
    method: 'item/completed',
    params: { item: { id: 'r1', type: 'reasoning', summary: [{ text: 'read ledger' }] } },
  })
  assert.equal(reasoning.type, 'thinking')
  assert.equal(reasoning.text, 'read ledger')
  assert.equal(reasoning.provider.adapter, 'codex-desktop')

  const tool = normalizeCodexDesktopNotification({
    method: 'item/started',
    params: { item: { id: 'c1', type: 'commandExecution', status: 'inProgress' } },
  })
  assert.equal(tool.type, 'tool')
  assert.equal(tool.tool.name, 'commandExecution')
  assert.equal(tool.tool.status, 'inProgress')
})

test('Codex Desktop adapter speaks app-server JSONL and returns a durable thread', async () => {
  const capture = { calls: [], messages: [] }
  const progress = []
  const adapter = createCodexDesktopMainThreadAdapter({
    spawnImpl: fakeSpawn(capture),
    resolveBin: async () => '/Applications/ChatGPT.app/Contents/Resources/codex',
    timeoutMs: 1000,
  })

  const result = await adapter.runTurn({
    projectRoot: '/repo',
    message: 'inspect the ledger',
    onEvent: async (event) => progress.push(event),
  })

  assert.equal(result.externalThreadId, 'thr-desktop-1')
  assert.equal(result.responseText, 'T012 — TUI dispatch wiring')
  assert.deepEqual(result.events, [])
  assert.equal(progress.some((event) => event.type === 'thinking'), true)
  assert.equal(progress.some((event) => event.type === 'tool'), true)
  assert.equal(capture.calls[0].bin, '/Applications/ChatGPT.app/Contents/Resources/codex')
  assert.deepEqual(capture.calls[0].args, ['app-server', '--listen', 'stdio://'])

  const initialize = capture.messages.find((message) => message.method === 'initialize')
  assert.equal(initialize.params.clientInfo.name, 'mira_forge')
  assert.equal(capture.messages.some((message) => message.method === 'initialized'), true)
  const threadStart = capture.messages.find((message) => message.method === 'thread/start')
  assert.equal(threadStart.params.sandbox, 'read-only')
  const turnStart = capture.messages.find((message) => message.method === 'turn/start')
  assert.deepEqual(turnStart.params.sandboxPolicy, { type: 'readOnly' })
  await adapter.dispose()
  assert.equal(capture.closed, 1)
})

test('Codex Desktop adapter resumes the exact prior app-server thread after Forge does not own it', async () => {
  const capture = { calls: [], messages: [] }
  const adapter = createCodexDesktopMainThreadAdapter({
    spawnImpl: fakeSpawn(capture),
    resolveBin: async () => '/Applications/Codex.app/Contents/Resources/codex',
    timeoutMs: 1000,
  })

  const result = await adapter.runTurn({
    projectRoot: '/repo',
    message: 'continue',
    externalThreadId: 'thr-desktop-1',
  })

  assert.equal(result.externalThreadId, 'thr-desktop-1')
  const resume = capture.messages.find((message) => message.method === 'thread/resume')
  assert.equal(resume.params.threadId, 'thr-desktop-1')
  assert.equal(resume.params.sandbox, 'read-only')
  assert.equal(capture.messages.some((message) => message.method === 'thread/start'), false)
  await adapter.dispose()
})

test('Codex Desktop keeps one app-server writer for consecutive turns in the same Forge thread', async () => {
  const capture = { calls: [], messages: [] }
  const adapter = createCodexDesktopMainThreadAdapter({
    spawnImpl: fakeSpawn(capture),
    resolveBin: async () => '/Applications/ChatGPT.app/Contents/Resources/codex',
    timeoutMs: 1000,
  })

  const first = await adapter.runTurn({ projectRoot: '/repo', message: 'first turn' })
  const second = await adapter.runTurn({
    projectRoot: '/repo',
    message: 'second turn',
    externalThreadId: first.externalThreadId,
  })

  assert.equal(second.externalThreadId, first.externalThreadId)
  assert.equal(capture.calls.length, 1)
  assert.equal(capture.messages.filter((message) => message.method === 'initialize').length, 1)
  assert.equal(capture.messages.filter((message) => message.method === 'thread/start').length, 1)
  assert.equal(capture.messages.filter((message) => message.method === 'thread/resume').length, 0)
  assert.equal(capture.messages.filter((message) => message.method === 'turn/start').length, 2)

  await adapter.dispose()
  assert.equal(capture.closed, 1)
})

test('Codex Desktop reports an actionable conflict when an external writer owns a persisted thread', async () => {
  const threadId = 'thr-busy-1'
  const capture = {
    calls: [],
    messages: [],
    resumeError: `thread ${threadId} already has an active writer`,
  }
  const adapter = createCodexDesktopMainThreadAdapter({
    spawnImpl: fakeSpawn(capture),
    resolveBin: async () => '/Applications/ChatGPT.app/Contents/Resources/codex',
    timeoutMs: 1000,
  })

  await assert.rejects(
    () => adapter.runTurn({ projectRoot: '/repo', message: 'continue', externalThreadId: threadId }),
    /owned by another app-server writer.*open a new Forge Main Thread/i,
  )
  assert.equal(capture.closed, 1)
  await adapter.dispose()
})

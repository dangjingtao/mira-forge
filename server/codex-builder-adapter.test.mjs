import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import {
  buildCodexBuilderArgs,
  createCodexBuilderRunner,
  normalizeCodexBuilderEvent,
  parseCodexBuilderJsonLine,
  parseCodexBuilderPrefixArgs,
  resolveCodexBuilderBinary,
} from './codex-builder-adapter.mjs'

test('Codex Builder args use Desktop backend with workspace-write and no bypass flag', () => {
  const args = buildCodexBuilderArgs({
    prefixArgs: ['fake-codex-wrapper'],
    projectRoot: '/tmp/project',
    prompt: 'Do T016',
    model: 'gpt-codex',
  })

  assert.deepEqual(args, [
    'fake-codex-wrapper',
    '--ask-for-approval',
    'never',
    'exec',
    '--json',
    '--sandbox',
    'workspace-write',
    '-C',
    '/tmp/project',
    '--model',
    'gpt-codex',
    'Do T016',
  ])
  assert.equal(args.some((value) => /bypass|dangerously/i.test(value)), false)
})

test('Codex Builder prefix args are explicit JSON string arrays', () => {
  assert.deepEqual(parseCodexBuilderPrefixArgs('["wrapper.mjs","--fake"]'), ['wrapper.mjs', '--fake'])
  assert.deepEqual(parseCodexBuilderPrefixArgs(''), [])
  assert.throws(() => parseCodexBuilderPrefixArgs('{"bad":true}'), /JSON array of strings/)
  assert.throws(() => parseCodexBuilderPrefixArgs('[1]'), /JSON array of strings/)
})

test('Codex Builder resolves the installed Desktop bundled backend without requiring PATH codex', () => {
  const allowed = '/Users/demo/Applications/ChatGPT.app/Contents/Resources/codex'
  const resolved = resolveCodexBuilderBinary({
    home: '/Users/demo',
    platform: 'darwin',
    accessImpl(path) {
      if (path !== allowed) throw new Error('missing')
    },
  })

  assert.equal(resolved, allowed)
})

test('Codex Builder malformed JSONL is ignored and provider events normalize', () => {
  assert.equal(parseCodexBuilderJsonLine('not-json'), null)
  assert.equal(parseCodexBuilderJsonLine('[]'), null)
  assert.deepEqual(normalizeCodexBuilderEvent({ type: 'thread.started', thread_id: 'codex-thread-1' }), {
    externalSessionId: 'codex-thread-1',
    provider: { adapter: 'codex', eventType: 'thread.started', status: 'running' },
  })
  assert.deepEqual(normalizeCodexBuilderEvent({
    type: 'item.completed',
    item: { type: 'command_execution', status: 'completed' },
  }), {
    tool: { name: 'command_execution', status: 'completed' },
    provider: {
      adapter: 'codex',
      eventType: 'item.completed',
      itemType: 'command_execution',
      status: 'completed',
    },
  })
})

test('Codex Builder runner reports process identity, thread identity, events and final text', async () => {
  let captured
  const spawnImpl = (bin, args, options) => {
    captured = { bin, args, options }
    const child = new EventEmitter()
    child.pid = 6161
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.kill = () => true
    queueMicrotask(() => {
      child.emit('spawn')
      child.stdout.write('garbage\n')
      child.stdout.write('{"type":"thread.started","thread_id":"codex-thread-1"}\n')
      child.stdout.write('{"type":"item.started","item":{"type":"command_execution","status":"in_progress"}}\n')
      child.stdout.write('{"type":"item.completed","item":{"type":"command_execution","status":"completed"}}\n')
      child.stdout.write('{"type":"item.completed","item":{"type":"agent_message","text":"done from codex"}}\n')
      child.stderr.write('diagnostic')
      child.emit('close', 0, null)
    })
    return child
  }

  const runner = createCodexBuilderRunner({
    bin: '/Applications/ChatGPT.app/Contents/Resources/codex',
    resolveBin: ({ bin }) => bin,
    spawnImpl,
    environment: { TEST: '1' },
  })
  const observed = []
  let started
  const result = await new Promise((resolvePromise, reject) => {
    runner.start({
      projectRoot: '/tmp/project',
      prompt: 'run task',
      onStarted: (info) => { started = info },
      onEvent: (event) => observed.push(event),
      onExit: resolvePromise,
      onError: reject,
    })
  })

  assert.equal(captured.bin, '/Applications/ChatGPT.app/Contents/Resources/codex')
  assert.equal(captured.options.cwd, '/tmp/project')
  assert.equal(captured.options.shell, false)
  assert.deepEqual(started, { pid: 6161 })
  assert.equal(observed[0].externalSessionId, 'codex-thread-1')
  assert.equal(observed.some((event) => event.tool?.name === 'command_execution' && event.tool?.status === 'completed'), true)
  assert.equal(result.code, 0)
  assert.equal(result.resultText, 'done from codex')
  assert.equal(result.stderr, 'diagnostic')
})

test('Codex Builder turn failure survives a zero process exit for the manager to reject', async () => {
  const spawnImpl = () => {
    const child = new EventEmitter()
    child.pid = 6162
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.kill = () => true
    queueMicrotask(() => {
      child.emit('spawn')
      child.stdout.write('{"type":"turn.failed","error":{"message":"provider failed"}}\n')
      child.emit('close', 0, null)
    })
    return child
  }

  const result = await new Promise((resolvePromise, reject) => {
    createCodexBuilderRunner({ bin: '/fake/codex', resolveBin: ({ bin }) => bin, spawnImpl }).start({
      projectRoot: '/tmp/project',
      prompt: 'run task',
      onExit: resolvePromise,
      onError: reject,
    })
  })

  assert.equal(result.code, 0)
  assert.equal(result.errorText, 'provider failed')
})

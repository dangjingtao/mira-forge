import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import {
  buildOpenCodeArgs,
  createOpenCodeRunner,
  parseOpenCodeJsonLine,
  parseOpenCodePrefixArgs,
} from './opencode-adapter.mjs'

test('OpenCode args keep the permission boundary and optional model/agent', () => {
  const args = buildOpenCodeArgs({
    prefixArgs: ['fake-opencode.mjs'],
    projectRoot: '/tmp/project',
    prompt: 'Do T009',
    model: 'provider/model',
    agent: 'build',
  })

  assert.deepEqual(args, [
    'fake-opencode.mjs',
    'run',
    '--format',
    'json',
    '--dir',
    '/tmp/project',
    '--model',
    'provider/model',
    '--agent',
    'build',
    'Do T009',
  ])
  assert.equal(args.includes('--dangerously-skip-permissions'), false)
})

test('OpenCode prefix args are explicit JSON string arrays', () => {
  assert.deepEqual(parseOpenCodePrefixArgs('["script.mjs","--fake"]'), ['script.mjs', '--fake'])
  assert.deepEqual(parseOpenCodePrefixArgs(''), [])
  assert.throws(() => parseOpenCodePrefixArgs('{"bad":true}'), /JSON array of strings/)
  assert.throws(() => parseOpenCodePrefixArgs('[1]'), /JSON array of strings/)
})

test('malformed JSONL is ignored instead of failing the run', () => {
  assert.equal(parseOpenCodeJsonLine('not-json'), null)
  assert.equal(parseOpenCodeJsonLine('[]'), null)
  assert.deepEqual(parseOpenCodeJsonLine('{"type":"step_start","sessionID":"ses_1"}'), {
    type: 'step_start',
    sessionID: 'ses_1',
  })
})

test('OpenCode runner reports spawn, JSON events and process exit', async () => {
  let captured
  const spawnImpl = (bin, args, options) => {
    captured = { bin, args, options }
    const child = new EventEmitter()
    child.pid = 4242
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.kill = () => true
    queueMicrotask(() => {
      child.emit('spawn')
      child.stdout.write('garbage line\n')
      child.stdout.write('{"type":"step_start","sessionID":"ses_fake"}\n')
      child.stdout.write('{"type":"text","sessionID":"ses_fake","part":{"type":"text","text":"done"}}\n')
      child.stderr.write('diagnostic')
      child.emit('close', 0, null)
    })
    return child
  }

  const runner = createOpenCodeRunner({ bin: 'node', prefixArgs: ['fake.mjs'], spawnImpl, environment: { TEST: '1' } })
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

  assert.equal(captured.bin, 'node')
  assert.equal(captured.options.cwd, '/tmp/project')
  assert.equal(captured.options.shell, false)
  assert.deepEqual(started, { pid: 4242 })
  assert.equal(observed.length, 2)
  assert.equal(observed[0].sessionID, 'ses_fake')
  assert.equal(result.code, 0)
  assert.equal(result.resultText, 'done')
  assert.equal(result.stderr, 'diagnostic')
})

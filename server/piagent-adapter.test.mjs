import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import {
  buildPiAgentArgs,
  createPiAgentRunner,
  normalizePiAgentEvent,
  parsePiAgentJsonLine,
  parsePiAgentPrefixArgs,
} from './piagent-adapter.mjs'

test('PiAgent args use deterministic JSON print mode without permission bypass flags', () => {
  const args = buildPiAgentArgs({
    prefixArgs: ['fake-pi.mjs'],
    projectRoot: '/tmp/project',
    prompt: 'Do T016',
    model: 'provider/model',
  })

  assert.deepEqual(args, [
    'fake-pi.mjs',
    '--mode',
    'json',
    '-p',
    '--no-session',
    '--model',
    'provider/model',
    '--',
    'Do T016',
  ])
  assert.equal(args.some((value) => /bypass|dangerous/i.test(value)), false)
})

test('PiAgent prefix args are explicit JSON string arrays', () => {
  assert.deepEqual(parsePiAgentPrefixArgs('["script.mjs","--fake"]'), ['script.mjs', '--fake'])
  assert.deepEqual(parsePiAgentPrefixArgs(''), [])
  assert.throws(() => parsePiAgentPrefixArgs('{"bad":true}'), /JSON array of strings/)
  assert.throws(() => parsePiAgentPrefixArgs('[1]'), /JSON array of strings/)
})

test('PiAgent malformed JSONL is ignored and lifecycle events normalize', () => {
  assert.equal(parsePiAgentJsonLine('not-json'), null)
  assert.equal(parsePiAgentJsonLine('[]'), null)
  assert.deepEqual(normalizePiAgentEvent({ type: 'session', id: 'pi-session-1' }), {
    externalSessionId: 'pi-session-1',
    provider: { adapter: 'piagent', eventType: 'session', status: 'running' },
  })
  assert.deepEqual(normalizePiAgentEvent({
    type: 'tool_execution_end',
    toolName: 'bash',
    isError: false,
  }), {
    tool: { name: 'bash', status: 'completed' },
    provider: {
      adapter: 'piagent',
      eventType: 'tool_execution_end',
      itemType: 'tool',
      status: 'completed',
    },
  })
})

test('PiAgent runner reports process identity, provider session, final text and exit', async () => {
  let captured
  const spawnImpl = (bin, args, options) => {
    captured = { bin, args, options }
    const child = new EventEmitter()
    child.pid = 5151
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.kill = () => true
    queueMicrotask(() => {
      child.emit('spawn')
      child.stdout.write('garbage\n')
      child.stdout.write('{"type":"session","version":3,"id":"pi-session-1"}\n')
      child.stdout.write('{"type":"tool_execution_start","toolCallId":"t1","toolName":"bash","args":{}}\n')
      child.stdout.write('{"type":"tool_execution_end","toolCallId":"t1","toolName":"bash","result":{},"isError":false}\n')
      child.stdout.write('{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"done from pi"}],"stopReason":"stop"}}\n')
      child.stderr.write('diagnostic')
      child.emit('close', 0, null)
    })
    return child
  }

  const runner = createPiAgentRunner({ bin: 'node', prefixArgs: ['fake.mjs'], spawnImpl, environment: { TEST: '1' } })
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
  assert.deepEqual(started, { pid: 5151 })
  assert.equal(observed[0].externalSessionId, 'pi-session-1')
  assert.equal(observed.some((event) => event.tool?.name === 'bash' && event.tool?.status === 'completed'), true)
  assert.equal(result.code, 0)
  assert.equal(result.resultText, 'done from pi')
  assert.equal(result.stderr, 'diagnostic')
})

test('PiAgent provider error survives a zero process exit for the manager to reject', async () => {
  const spawnImpl = () => {
    const child = new EventEmitter()
    child.pid = 5152
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.kill = () => true
    queueMicrotask(() => {
      child.emit('spawn')
      child.stdout.write('{"type":"message_end","message":{"role":"assistant","content":[],"stopReason":"error","errorMessage":"provider failed"}}\n')
      child.emit('close', 0, null)
    })
    return child
  }

  const result = await new Promise((resolvePromise, reject) => {
    createPiAgentRunner({ spawnImpl }).start({
      projectRoot: '/tmp/project',
      prompt: 'run task',
      onExit: resolvePromise,
      onError: reject,
    })
  })

  assert.equal(result.code, 0)
  assert.equal(result.errorText, 'provider failed')
})

import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const MAX_CAPTURE = 32_768
const MAX_STDERR = 8192
const MAX_EVENTS = 64
const CODEX_DESKTOP_READ_ONLY_MODE = 'read-only'

function requiredString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`)
  return value.trim()
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function appendBounded(current, value, limit = MAX_CAPTURE) {
  const next = `${current}${value}`
  return next.length <= limit ? next : next.slice(next.length - limit)
}

function reasoningText(value) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (!Array.isArray(value)) return null
  const parts = value.flatMap((item) => {
    if (typeof item === 'string') return [item]
    if (!item || typeof item !== 'object') return []
    if (typeof item.text === 'string') return [item.text]
    return []
  }).map((item) => item.trim()).filter(Boolean)
  return parts.length ? parts.join('\n') : null
}

function createProgressPublisher(onEvent) {
  let chain = Promise.resolve()
  let error = null
  return {
    publish(event) {
      if (typeof onEvent !== 'function') return
      chain = chain.then(() => onEvent(event)).catch((cause) => {
        error ||= cause instanceof Error ? cause : new Error(String(cause))
      })
    },
    async flush() {
      await chain
      if (error) throw error
    },
    streamed() {
      return typeof onEvent === 'function'
    },
  }
}

export function codexDesktopBinaryCandidates(home = homedir()) {
  return [
    '/Applications/ChatGPT.app/Contents/Resources/codex',
    '/Applications/Codex.app/Contents/Resources/codex',
    join(home, 'Applications', 'ChatGPT.app', 'Contents', 'Resources', 'codex'),
    join(home, 'Applications', 'Codex.app', 'Contents', 'Resources', 'codex'),
  ]
}

export async function resolveCodexDesktopBinary({
  bin = null,
  accessImpl = access,
  home = homedir(),
  platform = process.platform,
} = {}) {
  const explicit = optionalString(bin)
  if (explicit) {
    try {
      await accessImpl(explicit, constants.X_OK)
      return explicit
    } catch {
      throw new Error(`Codex Desktop bundled backend is not executable: ${explicit}`)
    }
  }

  if (platform !== 'darwin') {
    throw new Error('Codex Desktop auto-discovery currently supports macOS app bundles only; set MIRA_FORGE_CODEX_DESKTOP_BIN explicitly')
  }

  for (const candidate of codexDesktopBinaryCandidates(home)) {
    try {
      await accessImpl(candidate, constants.X_OK)
      return candidate
    } catch {
      // Keep looking for the current or legacy desktop bundle.
    }
  }

  throw new Error('Codex Desktop was not found. Expected ChatGPT.app or Codex.app in /Applications (or ~/Applications); set MIRA_FORGE_CODEX_DESKTOP_BIN to override')
}

export function buildCodexDesktopThreadRequest({ projectRoot, externalThreadId, model }) {
  const cwd = requiredString(projectRoot, 'projectRoot')
  const threadId = optionalString(externalThreadId)
  const params = {
    cwd,
    approvalPolicy: 'never',
    // thread/start and thread/resume use SandboxMode (kebab-case), not
    // the turn-level SandboxPolicy object discriminator.
    sandbox: CODEX_DESKTOP_READ_ONLY_MODE,
  }
  if (optionalString(model)) params.model = model.trim()
  if (threadId) {
    return {
      method: 'thread/resume',
      params: { ...params, threadId, excludeTurns: true },
    }
  }
  return {
    method: 'thread/start',
    params: { ...params, serviceName: 'mira_forge' },
  }
}

export function buildCodexDesktopTurnRequest({ projectRoot, threadId, message, model }) {
  const cwd = requiredString(projectRoot, 'projectRoot')
  const id = requiredString(threadId, 'threadId')
  const text = requiredString(message, 'message')
  const params = {
    threadId: id,
    input: [{ type: 'text', text }],
    cwd,
    approvalPolicy: 'never',
    // turn/start uses SandboxPolicy, whose discriminator is camelCase.
    sandboxPolicy: { type: 'readOnly' },
  }
  if (optionalString(model)) params.model = model.trim()
  return params
}

export function normalizeCodexDesktopNotification(message, reasoningFallback = null) {
  if (!message || typeof message !== 'object') return null
  if (!['item/started', 'item/completed'].includes(message.method)) return null
  const item = message.params?.item
  if (!item || typeof item !== 'object') return null
  const itemType = optionalString(item.type)
  if (!itemType) return null
  const terminal = message.method === 'item/completed'
  const status = optionalString(item.status) || (terminal ? 'completed' : 'running')

  if (itemType === 'reasoning' && terminal) {
    const text = reasoningText(item.summary) || reasoningText(item.content) || optionalString(item.text) || optionalString(reasoningFallback)
    if (!text) return null
    return {
      type: 'thinking',
      text,
      provider: {
        adapter: 'codex-desktop',
        eventType: message.method,
        itemType,
        status,
      },
    }
  }

  if (itemType === 'plan' && terminal && optionalString(item.text)) {
    return {
      type: 'thinking',
      text: item.text.trim(),
      provider: {
        adapter: 'codex-desktop',
        eventType: message.method,
        itemType,
        status,
      },
    }
  }

  if (['commandExecution', 'mcpToolCall', 'webSearch'].includes(itemType)) {
    const toolName = itemType === 'mcpToolCall'
      ? [optionalString(item.server), optionalString(item.tool)].filter(Boolean).join('.') || itemType
      : itemType
    return {
      type: 'tool',
      tool: { name: toolName, status },
      provider: {
        adapter: 'codex-desktop',
        eventType: message.method,
        itemType,
        status,
      },
    }
  }

  if (itemType === 'fileChange') {
    return {
      type: 'artifact',
      artifact: { kind: 'provider-file-change', ref: null },
      provider: {
        adapter: 'codex-desktop',
        eventType: message.method,
        itemType,
        status,
      },
    }
  }

  return null
}

function parseJsonLine(line) {
  if (typeof line !== 'string' || !line.trim()) return null
  try {
    const parsed = JSON.parse(line)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function createAppServerProcess({ bin, prefixArgs, cwd, env, timeoutMs, spawnImpl, onNotification }) {
  const child = spawnImpl(bin, [...prefixArgs, 'app-server', '--listen', 'stdio://'], {
    cwd,
    env,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let stdoutBuffer = ''
  let stderr = ''
  let nextId = 1
  let closed = false
  let closeInfo = null
  let timer = null
  const pending = new Map()
  let closeResolve
  const closePromise = new Promise((resolve) => { closeResolve = resolve })

  const rejectPending = (error) => {
    for (const waiter of pending.values()) waiter.reject(error)
    pending.clear()
  }

  const send = (message) => {
    if (closed || !child.stdin?.writable) throw new Error('Codex Desktop app-server stdin is closed')
    child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  const consume = (message) => {
    if (Object.prototype.hasOwnProperty.call(message, 'id') && !message.method) {
      const waiter = pending.get(String(message.id))
      if (!waiter) return
      pending.delete(String(message.id))
      if (message.error) {
        const detail = optionalString(message.error.message) || 'unknown JSON-RPC error'
        waiter.reject(new Error(`Codex Desktop app-server: ${detail}`))
      } else {
        waiter.resolve(message.result)
      }
      return
    }

    if (message.method && Object.prototype.hasOwnProperty.call(message, 'id')) {
      try {
        send({
          id: message.id,
          error: {
            code: -32601,
            message: 'Mira Forge read-only main thread does not handle interactive app-server requests',
          },
        })
      } catch {
        // Process close path remains authoritative.
      }
      return
    }

    if (message.method) onNotification(message)
  }

  const consumeLine = (line) => {
    const parsed = parseJsonLine(line)
    if (parsed) consume(parsed)
  }

  child.stdout?.on('data', (chunk) => {
    stdoutBuffer += chunk.toString()
    const lines = stdoutBuffer.split(/\r?\n/)
    stdoutBuffer = lines.pop() ?? ''
    for (const line of lines) consumeLine(line)
  })
  child.stderr?.on('data', (chunk) => {
    stderr = appendBounded(stderr, chunk.toString(), MAX_STDERR)
  })

  child.once('error', (error) => {
    if (closed) return
    closed = true
    if (timer) clearTimeout(timer)
    rejectPending(error)
    closeInfo = { code: null, signal: null, stderr: stderr.trim(), error }
    closeResolve(closeInfo)
  })
  child.once('close', (code, signal) => {
    if (stdoutBuffer) consumeLine(stdoutBuffer)
    stdoutBuffer = ''
    if (closed) return
    closed = true
    if (timer) clearTimeout(timer)
    const error = code === 0
      ? new Error('Codex Desktop app-server closed')
      : new Error(stderr.trim() || `Codex Desktop app-server exited with code ${code ?? 'unknown'}`)
    rejectPending(error)
    closeInfo = {
      code: Number.isInteger(code) ? code : null,
      signal: typeof signal === 'string' ? signal : null,
      stderr: stderr.trim(),
      error: null,
    }
    closeResolve(closeInfo)
  })

  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timer = setTimeout(() => {
      if (closed) return
      try { child.kill('SIGTERM') } catch { /* close path handles it */ }
      const error = new Error(`Codex Desktop app-server timed out after ${timeoutMs}ms`)
      rejectPending(error)
    }, timeoutMs)
    timer.unref?.()
  }

  return {
    request(method, params) {
      const id = nextId++
      return new Promise((resolve, reject) => {
        pending.set(String(id), { resolve, reject })
        try {
          send({ id, method, ...(params === undefined ? {} : { params }) })
        } catch (error) {
          pending.delete(String(id))
          reject(error)
        }
      })
    },
    notify(method, params) {
      send({ method, ...(params === undefined ? {} : { params }) })
    },
    async close() {
      if (!closed && child.stdin?.writable) child.stdin.end()
      const grace = new Promise((resolve) => setTimeout(resolve, 1200))
      await Promise.race([closePromise, grace])
      if (!closed) {
        try { child.kill('SIGTERM') } catch { /* ignore */ }
        await closePromise
      }
      return closeInfo
    },
    closePromise,
  }
}

export function createCodexDesktopMainThreadAdapter({
  bin = null,
  prefixArgs = [],
  spawnImpl = spawn,
  environment = process.env,
  timeoutMs = 300_000,
  resolveBin = resolveCodexDesktopBinary,
} = {}) {
  return {
    id: 'codex-desktop',
    async runTurn(input) {
      const projectRoot = requiredString(input.projectRoot, 'projectRoot')
      const message = requiredString(input.message, 'message')
      const resolvedBin = await resolveBin({ bin })
      const events = []
      const progress = createProgressPublisher(input.onEvent)
      const reasoningDeltas = new Map()
      const agentDeltas = new Map()
      let responseText = ''
      let providerError = null
      let writeAttemptObserved = false
      let observedThreadId = null
      let targetTurnId = null
      let terminal = null
      let terminalResolve
      const terminalPromise = new Promise((resolve) => { terminalResolve = resolve })

      const publishNormalized = (normalized) => {
        if (!normalized || events.length >= MAX_EVENTS) return
        events.push(normalized)
        progress.publish(normalized)
      }

      const client = createAppServerProcess({
        bin: resolvedBin,
        prefixArgs,
        cwd: projectRoot,
        env: environment,
        timeoutMs,
        spawnImpl,
        onNotification(notification) {
          const method = optionalString(notification.method)
          const params = notification.params && typeof notification.params === 'object' ? notification.params : {}
          const item = params.item && typeof params.item === 'object' ? params.item : null

          if (method === 'item/reasoning/summaryTextDelta' && optionalString(params.itemId) && typeof params.delta === 'string') {
            const key = params.itemId.trim()
            reasoningDeltas.set(key, appendBounded(reasoningDeltas.get(key) || '', params.delta, 16_384))
          }
          if (method === 'item/reasoning/textDelta' && optionalString(params.itemId) && typeof params.delta === 'string') {
            const key = params.itemId.trim()
            reasoningDeltas.set(key, appendBounded(reasoningDeltas.get(key) || '', params.delta, 16_384))
          }
          if (method === 'item/agentMessage/delta' && optionalString(params.itemId) && typeof params.delta === 'string') {
            const key = params.itemId.trim()
            agentDeltas.set(key, appendBounded(agentDeltas.get(key) || '', params.delta))
          }

          if (item?.type === 'fileChange') writeAttemptObserved = true
          if (method === 'item/completed' && item?.type === 'agentMessage' && typeof item.text === 'string' && item.text.trim()) {
            responseText = appendBounded(responseText, `${item.text.trim()}\n`)
          }

          const fallback = item?.id ? reasoningDeltas.get(String(item.id)) : null
          publishNormalized(normalizeCodexDesktopNotification(notification, fallback))

          if (method === 'error') {
            const messageText = params.error?.message || params.message
            if (typeof messageText === 'string' && messageText.trim()) providerError = messageText.trim()
          }

          if (method === 'turn/completed') {
            const threadId = optionalString(params.threadId)
            const turn = params.turn && typeof params.turn === 'object' ? params.turn : null
            const turnId = optionalString(turn?.id) || optionalString(params.turnId)
            if ((!observedThreadId || !threadId || threadId === observedThreadId)
              && (!targetTurnId || !turnId || turnId === targetTurnId)) {
              terminal = notification
              terminalResolve(notification)
            }
          }
        },
      })

      try {
        await client.request('initialize', {
          clientInfo: {
            name: 'mira_forge',
            title: 'Mira Forge',
            version: '0.1.0',
          },
          capabilities: { experimentalApi: false },
        })
        client.notify('initialized')

        const openRequest = buildCodexDesktopThreadRequest({
          projectRoot,
          externalThreadId: input.externalThreadId,
          model: input.model,
        })
        const openResult = await client.request(openRequest.method, openRequest.params)
        observedThreadId = optionalString(openResult?.thread?.id)
        if (!observedThreadId) throw new Error('Codex Desktop app-server did not return a durable thread ID')
        if (input.externalThreadId && observedThreadId !== input.externalThreadId) {
          throw new Error('Codex Desktop resumed a different thread')
        }

        const turnResult = await client.request('turn/start', buildCodexDesktopTurnRequest({
          projectRoot,
          threadId: observedThreadId,
          message,
          model: input.model,
        }))
        targetTurnId = optionalString(turnResult?.turn?.id)
        if (!targetTurnId) throw new Error('Codex Desktop app-server did not return a turn ID')
        if (!terminal) await Promise.race([
          terminalPromise,
          client.closePromise.then((info) => {
            throw new Error(info?.stderr || 'Codex Desktop app-server closed before the turn completed')
          }),
        ])

        await progress.flush()
        const terminalTurn = terminal?.params?.turn
        if (terminalTurn?.status === 'failed') {
          const messageText = terminalTurn?.error?.message || providerError || 'Codex Desktop turn failed'
          throw new Error(messageText)
        }
        if (writeAttemptObserved) {
          throw new Error('Codex Desktop reported a file-change attempt in a read-only main thread')
        }

        if (!responseText.trim()) {
          const streamed = [...agentDeltas.values()].join('\n').trim()
          if (streamed) responseText = streamed
        }
        if (!responseText.trim()) throw new Error(providerError || 'Codex Desktop returned no assistant message')

        try {
          await client.request('thread/unsubscribe', { threadId: observedThreadId })
        } catch {
          // A completed turn is authoritative; cleanup failure must not erase it.
        }

        return {
          externalThreadId: observedThreadId,
          responseText: responseText.trim(),
          events: progress.streamed() ? [] : events,
          providerEventType: 'codex-desktop.turn.completed',
        }
      } finally {
        await client.close().catch(() => undefined)
      }
    },
  }
}

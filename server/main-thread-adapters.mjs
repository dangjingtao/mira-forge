import { spawn } from 'node:child_process'

const MAX_CAPTURE = 32_768
const MAX_STDERR = 8192
const MAX_EVENTS = 64

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

export function parseMainThreadPrefixArgs(value, name = 'prefix args') {
  if (value === undefined || value === null || value === '') return []
  const parsed = typeof value === 'string' ? JSON.parse(value) : value
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new Error(`${name} must be a JSON array of strings`)
  }
  return parsed
}

export function buildOpenCodeMainThreadArgs({
  prefixArgs = [],
  projectRoot,
  message,
  externalThreadId,
  model,
}) {
  const root = requiredString(projectRoot, 'projectRoot')
  const prompt = requiredString(message, 'message')
  const args = [...prefixArgs, 'run', '--format', 'json', '--thinking', '--dir', root, '--agent', 'plan']
  if (optionalString(externalThreadId)) args.push('--session', externalThreadId.trim())
  if (optionalString(model)) args.push('--model', model.trim())
  args.push(prompt)
  return args
}

export function buildCodexMainThreadArgs({
  prefixArgs = [],
  projectRoot,
  message,
  externalThreadId,
  model,
}) {
  const root = requiredString(projectRoot, 'projectRoot')
  const prompt = requiredString(message, 'message')
  const args = [
    ...prefixArgs,
    'exec',
    '--json',
    '--sandbox',
    'read-only',
    '--ask-for-approval',
    'never',
    '-C',
    root,
  ]
  if (optionalString(model)) args.push('--model', model.trim())
  if (optionalString(externalThreadId)) args.push('resume', externalThreadId.trim(), prompt)
  else args.push(prompt)
  return args
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

export function normalizeOpenCodeThreadEvent(event) {
  if (!event || typeof event !== 'object') return null
  const part = event.part && typeof event.part === 'object' ? event.part : null
  const partType = optionalString(part?.type)
  if (partType && ['reasoning', 'thinking'].includes(partType)) {
    const text = optionalString(part?.text) || reasoningText(part?.summary) || optionalString(part?.content)
    if (!text) return null
    return {
      type: 'thinking',
      text,
      provider: {
        adapter: 'opencode',
        eventType: optionalString(event.type),
        itemType: partType,
        status: optionalString(part?.state?.status) || optionalString(part?.status),
      },
    }
  }
  if (partType && ['tool', 'tool_use', 'tool_result'].includes(partType)) {
    return {
      type: 'tool',
      tool: {
        name: optionalString(part?.tool) || optionalString(part?.name) || partType,
        status: optionalString(part?.state?.status) || optionalString(part?.status),
      },
      provider: {
        adapter: 'opencode',
        eventType: optionalString(event.type),
        itemType: partType,
        status: optionalString(part?.state?.status) || optionalString(part?.status),
      },
    }
  }
  return null
}

export function normalizeCodexThreadEvent(event) {
  if (!event || typeof event !== 'object') return null
  const item = event.item && typeof event.item === 'object' ? event.item : null
  const itemType = optionalString(item?.type)
  if (!itemType) return null

  if (itemType === 'reasoning') {
    const text = reasoningText(item?.summary) || reasoningText(item?.content) || optionalString(item?.text)
    if (!text) return null
    return {
      type: 'thinking',
      text,
      provider: {
        adapter: 'codex',
        eventType: optionalString(event.type),
        itemType,
        status: optionalString(item?.status),
      },
    }
  }
  if (['command_execution', 'mcp_tool_call', 'web_search'].includes(itemType)) {
    return {
      type: 'tool',
      tool: {
        name: itemType,
        status: optionalString(item?.status),
      },
      provider: {
        adapter: 'codex',
        eventType: optionalString(event.type),
        itemType,
        status: optionalString(item?.status),
      },
    }
  }
  if (itemType === 'file_change') {
    return {
      type: 'artifact',
      artifact: { kind: 'provider-file-change', ref: null },
      provider: {
        adapter: 'codex',
        eventType: optionalString(event.type),
        itemType,
        status: optionalString(item?.status),
      },
    }
  }
  return null
}

function runJsonLines({
  bin,
  args,
  cwd,
  env,
  timeoutMs,
  spawnImpl,
  consumeEvent,
}) {
  return new Promise((resolve, reject) => {
    let stdoutBuffer = ''
    let stderr = ''
    let settled = false
    let timer = null

    const child = spawnImpl(bin, args, {
      cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const finish = (handler) => {
      if (settled) return false
      settled = true
      if (timer) clearTimeout(timer)
      handler()
      return true
    }

    const consumeLine = (line) => {
      const event = parseJsonLine(line)
      if (event) consumeEvent(event)
    }

    const flush = () => {
      if (!stdoutBuffer) return
      consumeLine(stdoutBuffer)
      stdoutBuffer = ''
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
      finish(() => reject(error))
    })
    child.once('close', (code, signal) => {
      finish(() => {
        flush()
        resolve({
          code: Number.isInteger(code) ? code : null,
          signal: typeof signal === 'string' ? signal : null,
          stderr: stderr.trim(),
        })
      })
    })

    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timer = setTimeout(() => {
        if (settled) return
        try {
          child.kill('SIGTERM')
        } catch {
          // The close/error path below remains authoritative.
        }
        finish(() => reject(new Error(`main thread provider timed out after ${timeoutMs}ms`)))
      }, timeoutMs)
      timer.unref?.()
    }
  })
}

export function createOpenCodeMainThreadAdapter({
  bin = 'opencode',
  prefixArgs = [],
  spawnImpl = spawn,
  environment = process.env,
  timeoutMs = 300_000,
} = {}) {
  return {
    id: 'opencode',
    async runTurn(input) {
      const args = buildOpenCodeMainThreadArgs({ prefixArgs, ...input })
      const events = []
      const progress = createProgressPublisher(input.onEvent)
      let responseText = ''
      let observedThreadId = null
      let providerError = null

      const permissions = JSON.stringify({
        '*': 'deny',
        read: 'allow',
        glob: 'allow',
        grep: 'allow',
        list: 'allow',
        lsp: 'allow',
        webfetch: 'allow',
        websearch: 'allow',
      })
      const env = { ...environment, OPENCODE_PERMISSION: permissions }

      const result = await runJsonLines({
        bin,
        args,
        cwd: input.projectRoot,
        env,
        timeoutMs,
        spawnImpl,
        consumeEvent(event) {
          const sessionId = optionalString(event.sessionID)
          if (sessionId) observedThreadId = observedThreadId || sessionId

          const text = event?.part?.type === 'text' && typeof event.part.text === 'string'
            ? event.part.text
            : typeof event.text === 'string' ? event.text : ''
          if (text) responseText = appendBounded(responseText, `${text}\n`)

          const apiError = event?.error?.data?.message || event?.error?.message
          if (typeof apiError === 'string' && apiError.trim()) providerError = apiError.trim()

          const normalized = normalizeOpenCodeThreadEvent(event)
          if (normalized && events.length < MAX_EVENTS) {
            events.push(normalized)
            progress.publish(normalized)
          }
        },
      })
      await progress.flush()

      if (result.code !== 0) {
        throw new Error(providerError || result.stderr || `OpenCode exited with code ${result.code ?? 'unknown'}`)
      }
      if (input.externalThreadId && observedThreadId && observedThreadId !== input.externalThreadId) {
        throw new Error('OpenCode resumed a different session')
      }
      const externalThreadId = observedThreadId || optionalString(input.externalThreadId)
      if (!externalThreadId) throw new Error('OpenCode did not report a durable session ID')
      if (!responseText.trim()) throw new Error(providerError || 'OpenCode returned no assistant message')

      return {
        externalThreadId,
        responseText: responseText.trim(),
        events: progress.streamed() ? [] : events,
        providerEventType: 'opencode.turn.completed',
      }
    },
  }
}

export function createCodexMainThreadAdapter({
  bin = 'codex',
  prefixArgs = [],
  spawnImpl = spawn,
  environment = process.env,
  timeoutMs = 300_000,
} = {}) {
  return {
    id: 'codex',
    async runTurn(input) {
      const args = buildCodexMainThreadArgs({ prefixArgs, ...input })
      const events = []
      const progress = createProgressPublisher(input.onEvent)
      let responseText = ''
      let observedThreadId = null
      let providerError = null
      let writeAttemptObserved = false

      const result = await runJsonLines({
        bin,
        args,
        cwd: input.projectRoot,
        env: environment,
        timeoutMs,
        spawnImpl,
        consumeEvent(event) {
          if (event.type === 'thread.started' && optionalString(event.thread_id)) {
            observedThreadId = observedThreadId || event.thread_id.trim()
          }

          const item = event.item && typeof event.item === 'object' ? event.item : null
          if (event.type === 'item.completed' && item?.type === 'agent_message' && typeof item.text === 'string') {
            responseText = appendBounded(responseText, `${item.text}\n`)
          }
          if (item?.type === 'file_change') writeAttemptObserved = true

          const errorMessage = event?.error?.message || event?.message
          if (event.type === 'turn.failed' && typeof errorMessage === 'string' && errorMessage.trim()) {
            providerError = errorMessage.trim()
          }

          const normalized = normalizeCodexThreadEvent(event)
          if (normalized && events.length < MAX_EVENTS) {
            events.push(normalized)
            progress.publish(normalized)
          }
        },
      })
      await progress.flush()

      if (result.code !== 0) {
        throw new Error(providerError || result.stderr || `Codex exited with code ${result.code ?? 'unknown'}`)
      }
      if (writeAttemptObserved) throw new Error('Codex reported a file-change attempt in a read-only main thread')
      if (input.externalThreadId && observedThreadId !== input.externalThreadId) {
        throw new Error('Codex resume did not return the requested thread ID')
      }
      const externalThreadId = observedThreadId || optionalString(input.externalThreadId)
      if (!externalThreadId) throw new Error('Codex did not report a durable thread ID')
      if (!responseText.trim()) throw new Error(providerError || 'Codex returned no assistant message')

      return {
        externalThreadId,
        responseText: responseText.trim(),
        events: progress.streamed() ? [] : events,
        providerEventType: 'codex.turn.completed',
      }
    },
  }
}

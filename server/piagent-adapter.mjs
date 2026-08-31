import { spawn } from 'node:child_process'

const MAX_CAPTURE = 8192

function appendBounded(current, value, limit = MAX_CAPTURE) {
  const next = `${current}${value}`
  return next.length <= limit ? next : next.slice(next.length - limit)
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function messageText(message) {
  if (!message || typeof message !== 'object' || message.role !== 'assistant') return null
  if (typeof message.content === 'string') return optionalString(message.content)
  if (!Array.isArray(message.content)) return null
  const parts = message.content
    .filter((part) => part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text.trim())
    .filter(Boolean)
  return parts.length ? parts.join('\n') : null
}

export function parsePiAgentPrefixArgs(value) {
  if (value === undefined || value === null || value === '') return []
  const parsed = typeof value === 'string' ? JSON.parse(value) : value
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new Error('MIRA_FORGE_PIAGENT_PREFIX_ARGS must be a JSON array of strings')
  }
  return parsed
}

export function buildPiAgentArgs({ prefixArgs = [], projectRoot, prompt, model }) {
  if (typeof projectRoot !== 'string' || !projectRoot.trim()) throw new Error('projectRoot is required')
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('prompt is required')

  const args = [...prefixArgs, '--mode', 'json', '-p', '--no-session']
  if (optionalString(model)) args.push('--model', model.trim())
  args.push('--', prompt)
  return args
}

export function parsePiAgentJsonLine(line) {
  if (typeof line !== 'string' || !line.trim()) return null
  try {
    const parsed = JSON.parse(line)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function normalizePiAgentEvent(event) {
  if (!event || typeof event !== 'object') return null
  const type = optionalString(event.type)
  if (!type) return null

  if (type === 'session' && optionalString(event.id)) {
    return {
      externalSessionId: event.id.trim(),
      provider: { adapter: 'piagent', eventType: type, status: 'running' },
    }
  }
  if (type === 'agent_start' || type === 'agent_end') {
    return {
      provider: {
        adapter: 'piagent',
        eventType: type,
        status: type === 'agent_end' ? 'completed' : 'running',
      },
    }
  }
  if (type === 'tool_execution_start' || type === 'tool_execution_end') {
    return {
      tool: {
        name: optionalString(event.toolName) || 'tool',
        status: type === 'tool_execution_end'
          ? (event.isError ? 'failed' : 'completed')
          : 'running',
      },
      provider: {
        adapter: 'piagent',
        eventType: type,
        itemType: 'tool',
        status: type === 'tool_execution_end'
          ? (event.isError ? 'failed' : 'completed')
          : 'running',
      },
    }
  }
  return null
}

export function createPiAgentRunner({
  bin = 'pi',
  prefixArgs = [],
  spawnImpl = spawn,
  environment = process.env,
} = {}) {
  return {
    start(input) {
      const args = buildPiAgentArgs({
        prefixArgs,
        projectRoot: input.projectRoot,
        prompt: input.prompt,
        model: input.model,
      })
      const child = spawnImpl(bin, args, {
        cwd: input.projectRoot,
        env: environment,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let settled = false
      let stdoutBuffer = ''
      let stderr = ''
      let resultText = ''
      let errorText = ''

      const consumeLine = (line) => {
        const event = parsePiAgentJsonLine(line)
        if (!event) return

        if (event.type === 'message_end') {
          const text = messageText(event.message)
          if (text) resultText = appendBounded(resultText, `${text}\n`)
          if (event.message?.stopReason === 'error' && optionalString(event.message?.errorMessage)) {
            errorText = appendBounded(errorText, event.message.errorMessage.trim())
          }
        }
        if (event.type === 'turn_end' && optionalString(event.message?.errorMessage)) {
          errorText = appendBounded(errorText, event.message.errorMessage.trim())
        }

        const normalized = normalizePiAgentEvent(event)
        if (normalized) input.onEvent?.(normalized)
      }

      const flushStdout = () => {
        if (!stdoutBuffer) return
        consumeLine(stdoutBuffer)
        stdoutBuffer = ''
      }

      child.once('spawn', () => {
        input.onStarted?.({ pid: Number.isInteger(child.pid) ? child.pid : null })
      })
      child.stdout?.on('data', (chunk) => {
        stdoutBuffer += chunk.toString()
        const lines = stdoutBuffer.split(/\r?\n/)
        stdoutBuffer = lines.pop() ?? ''
        for (const line of lines) consumeLine(line)
      })
      child.stderr?.on('data', (chunk) => {
        stderr = appendBounded(stderr, chunk.toString())
      })
      child.once('error', (error) => {
        if (settled) return
        settled = true
        input.onError?.(error, { stderr })
      })
      child.once('close', (code, signal) => {
        if (settled) return
        settled = true
        flushStdout()
        input.onExit?.({
          code: Number.isInteger(code) ? code : null,
          signal: typeof signal === 'string' ? signal : null,
          stderr,
          resultText: resultText.trim() || null,
          errorText: errorText.trim() || null,
        })
      })

      return {
        get pid() {
          return Number.isInteger(child.pid) ? child.pid : null
        },
        kill(signal = 'SIGTERM') {
          try {
            return child.kill(signal)
          } catch {
            return false
          }
        },
      }
    },
  }
}

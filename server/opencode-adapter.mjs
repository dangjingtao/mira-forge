import { spawn } from 'node:child_process'

const MAX_CAPTURE = 8192

function appendBounded(current, value, limit = MAX_CAPTURE) {
  const next = `${current}${value}`
  return next.length <= limit ? next : next.slice(next.length - limit)
}

export function parseOpenCodePrefixArgs(value) {
  if (value === undefined || value === null || value === '') return []
  const parsed = typeof value === 'string' ? JSON.parse(value) : value
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new Error('MIRA_FORGE_OPENCODE_PREFIX_ARGS must be a JSON array of strings')
  }
  return parsed
}

export function buildOpenCodeArgs({ prefixArgs = [], projectRoot, prompt, model, agent }) {
  if (typeof projectRoot !== 'string' || !projectRoot.trim()) throw new Error('projectRoot is required')
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('prompt is required')

  const args = [...prefixArgs, 'run', '--format', 'json', '--dir', projectRoot]
  if (typeof model === 'string' && model.trim()) args.push('--model', model.trim())
  if (typeof agent === 'string' && agent.trim()) args.push('--agent', agent.trim())
  args.push(prompt)
  return args
}

export function parseOpenCodeJsonLine(line) {
  if (typeof line !== 'string' || !line.trim()) return null
  try {
    const parsed = JSON.parse(line)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function createOpenCodeRunner({
  bin = 'opencode',
  prefixArgs = [],
  spawnImpl = spawn,
  environment = process.env,
} = {}) {
  return {
    start(input) {
      const args = buildOpenCodeArgs({
        prefixArgs,
        projectRoot: input.projectRoot,
        prompt: input.prompt,
        model: input.model,
        agent: input.agent,
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
        const event = parseOpenCodeJsonLine(line)
        if (!event) return
        const text = event?.part?.type === 'text' && typeof event.part.text === 'string'
          ? event.part.text
          : typeof event.text === 'string' ? event.text : ''
        if (text) resultText = appendBounded(resultText, `${text}\n`)
        const apiError = event?.error?.data?.message || event?.error?.message
        if (typeof apiError === 'string' && apiError.trim()) errorText = appendBounded(errorText, apiError.trim())
        input.onEvent?.(event)
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

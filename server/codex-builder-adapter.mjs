import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { accessSync } from 'node:fs'
import { homedir } from 'node:os'
import { codexDesktopBinaryCandidates } from './codex-desktop-adapter.mjs'

const MAX_CAPTURE = 8192

function appendBounded(current, value, limit = MAX_CAPTURE) {
  const next = `${current}${value}`
  return next.length <= limit ? next : next.slice(next.length - limit)
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function parseCodexBuilderPrefixArgs(value) {
  if (value === undefined || value === null || value === '') return []
  const parsed = typeof value === 'string' ? JSON.parse(value) : value
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new Error('MIRA_FORGE_CODEX_BUILDER_PREFIX_ARGS must be a JSON array of strings')
  }
  return parsed
}

export function resolveCodexBuilderBinary({
  bin = null,
  accessImpl = accessSync,
  home = homedir(),
  platform = process.platform,
} = {}) {
  const explicit = optionalString(bin)
  if (explicit) {
    try {
      accessImpl(explicit, constants.X_OK)
      return explicit
    } catch {
      throw new Error(`Codex Builder backend is not executable: ${explicit}`)
    }
  }

  if (platform !== 'darwin') {
    throw new Error('Codex Desktop Builder auto-discovery currently supports macOS app bundles only; set MIRA_FORGE_CODEX_DESKTOP_BUILDER_BIN explicitly')
  }

  for (const candidate of codexDesktopBinaryCandidates(home)) {
    try {
      accessImpl(candidate, constants.X_OK)
      return candidate
    } catch {
      // Keep looking for the current or legacy desktop bundle.
    }
  }

  throw new Error('Codex Desktop Builder backend was not found. Expected ChatGPT.app or Codex.app in /Applications (or ~/Applications); set MIRA_FORGE_CODEX_DESKTOP_BUILDER_BIN to override')
}

export function buildCodexBuilderArgs({ prefixArgs = [], projectRoot, prompt, model }) {
  if (typeof projectRoot !== 'string' || !projectRoot.trim()) throw new Error('projectRoot is required')
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('prompt is required')

  const args = [
    ...prefixArgs,
    '--ask-for-approval',
    'never',
    'exec',
    '--json',
    '--sandbox',
    'workspace-write',
    '--cd',
    projectRoot,
  ]
  if (optionalString(model)) args.push('--model', model.trim())
  args.push(prompt)
  return args
}

export function parseCodexBuilderJsonLine(line) {
  if (typeof line !== 'string' || !line.trim()) return null
  try {
    const parsed = JSON.parse(line)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function normalizeCodexBuilderEvent(event) {
  if (!event || typeof event !== 'object') return null
  const type = optionalString(event.type)
  if (!type) return null

  if (type === 'thread.started' && optionalString(event.thread_id)) {
    return {
      externalSessionId: event.thread_id.trim(),
      provider: { adapter: 'codex', eventType: type, status: 'running' },
    }
  }

  const item = event.item && typeof event.item === 'object' ? event.item : null
  const itemType = optionalString(item?.type)
  if ((type === 'item.started' || type === 'item.completed') && itemType) {
    if (['command_execution', 'mcp_tool_call', 'web_search'].includes(itemType)) {
      return {
        tool: {
          name: itemType,
          status: optionalString(item?.status) || (type === 'item.completed' ? 'completed' : 'running'),
        },
        provider: {
          adapter: 'codex',
          eventType: type,
          itemType,
          status: optionalString(item?.status) || (type === 'item.completed' ? 'completed' : 'running'),
        },
      }
    }
    if (itemType === 'file_change') {
      return {
        artifact: { kind: 'provider-file-change', ref: null },
        provider: {
          adapter: 'codex',
          eventType: type,
          itemType,
          status: optionalString(item?.status) || (type === 'item.completed' ? 'completed' : 'running'),
        },
      }
    }
  }
  return null
}

export function createCodexBuilderRunner({
  bin = null,
  prefixArgs = [],
  spawnImpl = spawn,
  environment = process.env,
  resolveBin = resolveCodexBuilderBinary,
} = {}) {
  return {
    start(input) {
      const resolvedBin = resolveBin({ bin })
      const args = buildCodexBuilderArgs({
        prefixArgs,
        projectRoot: input.projectRoot,
        prompt: input.prompt,
        model: input.model,
      })
      const child = spawnImpl(resolvedBin, args, {
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
        const event = parseCodexBuilderJsonLine(line)
        if (!event) return

        const item = event.item && typeof event.item === 'object' ? event.item : null
        if (event.type === 'item.completed' && item?.type === 'agent_message' && typeof item.text === 'string' && item.text.trim()) {
          resultText = appendBounded(resultText, `${item.text.trim()}\n`)
        }
        if (event.type === 'turn.failed') {
          const message = event?.error?.message || event?.message
          if (typeof message === 'string' && message.trim()) errorText = appendBounded(errorText, message.trim())
        }

        const normalized = normalizeCodexBuilderEvent(event)
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

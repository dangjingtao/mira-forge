import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MARKER_FILE = 'mira-forge-acceptance.txt'
const MARKER_CONTENT = 'MIRA_FORGE_ACCEPTANCE_OK'

function errorMessage(value) {
  return value instanceof Error ? value.message : String(value)
}

function friendlyOpenCodeError(message) {
  const value = typeof message === 'string' ? message.trim() : ''
  if (!value) return null
  if (/valid CodingPlan subscription|subscription has expired/i.test(value)) return 'OpenCode 已连接到火山方舟，但当前 Coding Plan 无有效订阅或已过期。请续费/开通 Coding Plan，或切换到其他可用模型。'
  if (/exceeded the 5-hour usage quota|usage quota/i.test(value)) return 'OpenCode 的模型额度已用尽，请等待额度重置或升级套餐后重试。'
  if (/401|unauthorized|invalid.*(api|key)|authentication/i.test(value)) return 'OpenCode 鉴权失败，请检查当前 provider 的 API Key 是否有效。'
  if (/ProviderModelNotFoundError|Model not found:/i.test(value)) return 'OpenCode 的模型配置无效：未找到对应的 provider/model。请使用“provider/model”格式，并检查配置文件是否互相覆盖。'
  if (/ENOTFOUND|ECONN|timeout|timed out|network/i.test(value)) return 'OpenCode 无法连接模型服务，请检查网络、代理或服务地址。'
  return null
}

export function createOpenCodeAcceptance({ runner, baseDir = tmpdir(), timeoutMs = 120_000 } = {}) {
  if (!runner?.start) throw new Error('runner is required')
  let active = false

  return {
    get active() {
      return active
    },

    async run() {
      if (active) throw new Error('OpenCode first-run check is already running')
      active = true
      const startedMs = Date.now()
      const startedAt = new Date(startedMs).toISOString()
      const workspace = await mkdtemp(join(baseDir, 'mira-forge-acceptance-'))
      let externalSessionId = null
      let pid = null
      let diagnostic = null

      try {
        await writeFile(join(workspace, 'AGENTS.md'), [
          '# Mira Forge acceptance workspace',
          '',
          'This directory is disposable and exists only to verify the local Builder integration.',
          'Do not access parent directories or external repositories.',
        ].join('\n'))
        await writeFile(join(workspace, 'ACCEPTANCE.md'), [
          '# First-run check',
          '',
          `Create \`${MARKER_FILE}\` in this directory with the exact content:`,
          '',
          MARKER_CONTENT,
          '',
          'Do not modify any other file.',
        ].join('\n'))

        const execution = await new Promise((resolve) => {
          let settled = false
          let handle = null
          let timer = null

          const finish = (result) => {
            if (settled) return
            settled = true
            if (timer) clearTimeout(timer)
            resolve(result)
          }

          timer = setTimeout(() => {
            handle?.kill?.('SIGTERM')
            finish({ kind: 'timeout', error: `OpenCode did not finish within ${timeoutMs}ms` })
          }, timeoutMs)

          try {
            handle = runner.start({
              projectRoot: workspace,
              prompt: [
                'Run the Mira Forge first-run check.',
                'Read AGENTS.md and ACCEPTANCE.md in the current disposable workspace.',
                `Create ${MARKER_FILE} with exact content ${MARKER_CONTENT}.`,
                'Do not touch anything outside this workspace. Then finish.',
              ].join('\n'),
              onStarted: (info) => {
                pid = Number.isInteger(info?.pid) ? info.pid : null
              },
              onEvent: (event) => {
                if (!externalSessionId && typeof event?.sessionID === 'string' && event.sessionID.trim()) {
                  externalSessionId = event.sessionID.trim()
                }
                const message = event?.error?.data?.message || event?.error?.message
                if (typeof message === 'string' && message.trim()) diagnostic = message.trim()
              },
              onExit: (result) => finish({ kind: 'exit', ...result }),
              onError: (error, details = {}) => finish({
                kind: 'error',
                error: details.stderr?.trim() || errorMessage(error),
                resultText: null,
                code: null,
                signal: null,
              }),
            })
          } catch (error) {
            finish({ kind: 'error', error: errorMessage(error), resultText: null, code: null, signal: null })
          }
        })

        let markerVerified = false
        try {
          markerVerified = (await readFile(join(workspace, MARKER_FILE), 'utf8')).trim() === MARKER_CONTENT
        } catch {
          markerVerified = false
        }

        const exitCode = execution.kind === 'exit' ? execution.code ?? null : null
        const signal = execution.kind === 'exit' ? execution.signal ?? null : null
        const resultText = execution.resultText ?? null
        const rawError = execution.errorText || diagnostic || execution.stderr?.trim() || execution.error || null
        let error = null

        if (execution.kind === 'timeout') error = execution.error
        else if (execution.kind === 'error') error = execution.error
        else if (exitCode !== 0) error = friendlyOpenCodeError(rawError) || `OpenCode 执行失败（退出码 ${exitCode ?? 'unknown'}）。请查看诊断信息。`
        else if (!externalSessionId) error = 'OpenCode finished, but Forge did not observe a sessionID'
        else if (!markerVerified) error = 'OpenCode finished, but the disposable workspace marker was not verified'

        const ok = !error
        const endedMs = Date.now()
        return {
          ok,
          status: ok ? 'passed' : 'failed',
          startedAt,
          endedAt: new Date(endedMs).toISOString(),
          durationMs: endedMs - startedMs,
          adapterId: 'opencode-local',
          externalSessionId,
          pid,
          exitCode,
          signal,
          markerVerified,
          resultText,
          error,
          diagnostic: rawError,
          workspaceDisposable: true,
        }
      } finally {
        await rm(workspace, { recursive: true, force: true })
        active = false
      }
    },
  }
}

export { MARKER_CONTENT, MARKER_FILE }

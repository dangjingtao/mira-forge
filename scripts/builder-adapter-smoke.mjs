import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCodexBuilderRunner, parseCodexBuilderPrefixArgs } from '../server/codex-builder-adapter.mjs'
import { createPiAgentRunner, parsePiAgentPrefixArgs } from '../server/piagent-adapter.mjs'

const provider = process.argv[2]
if (!['piagent', 'codex'].includes(provider)) {
  console.error('Usage: node scripts/builder-adapter-smoke.mjs <piagent|codex>')
  process.exit(2)
}

const markerName = 'mira-forge-t016-smoke.txt'
const markerText = `mira-forge-t016-${provider}`
const root = await mkdtemp(join(tmpdir(), `mira-forge-${provider}-smoke-`))

function runnerFor(name) {
  if (name === 'piagent') {
    return createPiAgentRunner({
      bin: process.env.MIRA_FORGE_PIAGENT_BIN || 'pi',
      prefixArgs: parsePiAgentPrefixArgs(process.env.MIRA_FORGE_PIAGENT_PREFIX_ARGS),
    })
  }
  return createCodexBuilderRunner({
    bin: process.env.MIRA_FORGE_CODEX_DESKTOP_BUILDER_BIN || process.env.MIRA_FORGE_CODEX_DESKTOP_BIN || null,
    prefixArgs: parseCodexBuilderPrefixArgs(process.env.MIRA_FORGE_CODEX_BUILDER_PREFIX_ARGS),
  })
}

async function run() {
  execFileSync('git', ['init', '-q', '-b', 'dev', root], { stdio: 'ignore' })
  const runner = runnerFor(provider)
  let handle
  let externalSessionId = null

  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      handle?.kill?.('SIGTERM')
      reject(new Error(`${provider} Builder smoke timed out`))
    }, Number(process.env.MIRA_FORGE_BUILDER_SMOKE_TIMEOUT_MS || 180_000))
    timer.unref?.()

    try {
      handle = runner.start({
        projectRoot: root,
        prompt: [
          'This is a disposable Mira Forge Builder adapter smoke test.',
          `Create exactly one file named ${markerName} in the current repository root.`,
          `Its complete contents must be exactly: ${markerText}`,
          'Do not push, merge, deploy, access the network, or modify anything outside this disposable repository.',
          'After verifying the file, finish with a short confirmation.',
        ].join('\n'),
        onEvent(event) {
          if (!externalSessionId && typeof event?.externalSessionId === 'string') externalSessionId = event.externalSessionId
        },
        onExit(exit) {
          clearTimeout(timer)
          resolve(exit)
        },
        onError(error) {
          clearTimeout(timer)
          reject(error)
        },
      })
    } catch (error) {
      clearTimeout(timer)
      reject(error)
    }
  })

  if (result.code !== 0) throw new Error(result.stderr || `${provider} exited with code ${result.code ?? 'unknown'}`)
  if (result.errorText) throw new Error(result.errorText)
  const actual = await readFile(join(root, markerName), 'utf8')
  if (actual.trim() !== markerText) throw new Error(`marker mismatch: expected ${markerText}, got ${actual.trim()}`)

  console.log(JSON.stringify({
    ok: true,
    provider,
    externalSessionId,
    resultText: result.resultText,
    marker: markerName,
  }, null, 2))
}

try {
  await run()
} finally {
  await rm(root, { recursive: true, force: true })
}

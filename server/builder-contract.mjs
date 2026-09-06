export const OPENCODE_ADAPTER_ID = 'opencode-local'
export const PIAGENT_ADAPTER_ID = 'piagent-local'
export const CODEX_ADAPTER_ID = 'codex-desktop-local'

export const BUILDER_CHOICES = ['opencode', 'piagent', 'codex']

export const BUILTIN_BUILDERS = Object.freeze({
  [OPENCODE_ADAPTER_ID]: Object.freeze({
    id: OPENCODE_ADAPTER_ID,
    choice: 'opencode',
    name: 'OpenCode Local',
    kind: 'builder',
    capabilities: Object.freeze(['code', 'terminal', 'opencode-run']),
  }),
  [PIAGENT_ADAPTER_ID]: Object.freeze({
    id: PIAGENT_ADAPTER_ID,
    choice: 'piagent',
    name: 'PiAgent Local',
    kind: 'builder',
    capabilities: Object.freeze(['code', 'terminal', 'pi-json']),
  }),
  [CODEX_ADAPTER_ID]: Object.freeze({
    id: CODEX_ADAPTER_ID,
    choice: 'codex',
    name: 'Codex Desktop Local',
    kind: 'builder',
    capabilities: Object.freeze(['code', 'terminal', 'codex-exec', 'desktop-bundled']),
  }),
})

export const BUILTIN_BUILDER_ADAPTER_IDS = Object.freeze(Object.keys(BUILTIN_BUILDERS))

const BUILDER_ALIASES = new Map([
  ['opencode', OPENCODE_ADAPTER_ID],
  [OPENCODE_ADAPTER_ID, OPENCODE_ADAPTER_ID],
  ['pi', PIAGENT_ADAPTER_ID],
  ['piagent', PIAGENT_ADAPTER_ID],
  [PIAGENT_ADAPTER_ID, PIAGENT_ADAPTER_ID],
  ['codex', CODEX_ADAPTER_ID],
  ['codex-desktop', CODEX_ADAPTER_ID],
  [CODEX_ADAPTER_ID, CODEX_ADAPTER_ID],
])

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function resolveBuiltinBuilder(value) {
  const requested = optionalString(value)
  if (!requested) return null
  const adapterId = BUILDER_ALIASES.get(requested.toLowerCase())
  return adapterId ? BUILTIN_BUILDERS[adapterId] : null
}

export function resolveBuilderAdapterId(input = {}) {
  const adapterId = optionalString(input.adapterId)
  const preferred = optionalString(input.builder) || optionalString(input.preferredBuilder)

  if (!preferred) return adapterId || OPENCODE_ADAPTER_ID

  const builtin = resolveBuiltinBuilder(preferred)
  if (!builtin) throw new Error(`unsupported builder: ${preferred}`)
  if (adapterId && adapterId !== builtin.id) {
    throw new Error(`adapterId ${adapterId} conflicts with builder ${preferred}`)
  }
  return builtin.id
}

const args = process.argv.slice(2)

if (args.includes('--dangerously-skip-permissions')) {
  console.error('permission bypass flag must not be used')
  process.exit(91)
}

const dirIndex = args.indexOf('--dir')
if (dirIndex < 0 || !args[dirIndex + 1]) {
  console.error('missing --dir')
  process.exit(92)
}

const delayMs = Number(process.env.MIRA_FORGE_FAKE_OPENCODE_DELAY_MS || 0)
const exitCode = Number(process.env.MIRA_FORGE_FAKE_OPENCODE_EXIT || 0)
const sessionID = process.env.MIRA_FORGE_FAKE_OPENCODE_SESSION || 'ses_fake_dispatch'

console.log(JSON.stringify({ type: 'step_start', sessionID, part: { type: 'step-start' } }))
console.log('this malformed line should be ignored')
console.log(JSON.stringify({
  type: 'text',
  sessionID,
  part: { type: 'text', text: 'fake builder completed' },
}))

if (delayMs > 0) await new Promise((resolvePromise) => setTimeout(resolvePromise, delayMs))

console.log(JSON.stringify({ type: 'step_finish', sessionID, part: { type: 'step-finish' } }))
if (exitCode !== 0) console.error(`fake opencode exiting ${exitCode}`)
process.exit(exitCode)

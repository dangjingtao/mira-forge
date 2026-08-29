import { spawn } from 'node:child_process'

const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const children = [
  spawn(command, ['run', 'dev:server'], { stdio: 'inherit' }),
  spawn(command, ['run', 'dev:web'], { stdio: 'inherit' }),
]

let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  process.exitCode = code
}

for (const child of children) {
  child.on('exit', (code) => {
    if (!stopping && code && code !== 0) stop(code)
  })
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))

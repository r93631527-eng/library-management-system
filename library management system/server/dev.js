import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const applicationDirectory = fileURLToPath(new URL('../', import.meta.url))
const children = [
  spawn(process.execPath, ['server/index.js'], { cwd: applicationDirectory, stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { cwd: applicationDirectory, stdio: 'inherit' }),
]
let shuttingDown = false

function stop(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  process.exitCode = exitCode
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill()
  }
}

for (const child of children) {
  child.on('error', (error) => {
    console.error(`Could not start LibraAI development service: ${error.message}`)
    stop(1)
  })
  child.on('exit', (code) => {
    if (!shuttingDown) stop(code ?? 1)
  })
}

process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())

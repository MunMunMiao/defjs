import { spawn } from 'node:child_process'

const WEBSTORAGE_FLAG = '--no-experimental-webstorage'

function withDisabledWebstorage(options) {
  if (!process.allowedNodeEnvironmentFlags.has(WEBSTORAGE_FLAG)) {
    return options
  }

  if (!options?.trim()) {
    return WEBSTORAGE_FLAG
  }

  if (options.split(/\s+/).includes(WEBSTORAGE_FLAG)) {
    return options
  }

  return `${options} ${WEBSTORAGE_FLAG}`
}

const [command, ...args] = process.argv.slice(2)

if (!command) {
  console.error('Expected a command to run.')
  process.exit(1)
}

const child = spawn(command, args, {
  env: {
    ...process.env,
    NODE_OPTIONS: withDisabledWebstorage(process.env.NODE_OPTIONS),
  },
  shell: process.platform === 'win32',
  stdio: 'inherit',
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
  }

  process.exit(code ?? 1)
})

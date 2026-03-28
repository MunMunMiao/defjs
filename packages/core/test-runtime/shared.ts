import { execFile } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const runtimeRoot = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(runtimeRoot, '..')
const fixtureRoot = resolve(runtimeRoot, 'fixtures')

let buildPromise: Promise<void> | undefined

type CommandResult = {
  code: number
  stderr: string
  stdout: string
}

function runCommand(
  command: string,
  args: string[],
  options: {
    cwd: string
    env?: NodeJS.ProcessEnv
  },
): Promise<CommandResult> {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(
          Object.assign(error, {
            stderr,
            stdout,
          }),
        )
        return
      }

      resolvePromise({
        code: 0,
        stderr,
        stdout,
      })
    })

    child.unref()
  })
}

export async function ensureCoreDistBuilt(): Promise<void> {
  if (!buildPromise) {
    buildPromise = runCommand('bun', ['run', 'build'], {
      cwd: packageRoot,
      env: process.env,
    }).then(() => undefined)
  }

  await buildPromise
}

export async function runRuntimeFixture(runtime: 'bun' | 'deno', fixtureName: string, env: NodeJS.ProcessEnv): Promise<unknown> {
  await ensureCoreDistBuilt()

  const fixturePath = resolve(fixtureRoot, fixtureName)
  const command = runtime
  const args =
    runtime === 'bun'
      ? ['run', fixturePath]
      : ['run', '--quiet', '--allow-env=DEFJS_TEST_SERVER_HOST', '--allow-net', '--allow-read', fixturePath]

  const result = await runCommand(command, args, {
    cwd: packageRoot,
    env: {
      ...process.env,
      ...env,
    },
  })

  return JSON.parse(result.stdout.trim())
}

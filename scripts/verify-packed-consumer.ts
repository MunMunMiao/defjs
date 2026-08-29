const repositoryRoot = `${import.meta.dir}/..`
const packedDirectory = `${repositoryRoot}/test-out/packed-packages`
const consumerDirectory = `${repositoryRoot}/test-out/packed-consumer`

const packages = [
  { directory: 'core', name: '@defjs/core', tarball: 'defjs-core' },
  {
    directory: 'opentelemetry-server',
    name: '@defjs/opentelemetry-server',
    tarball: 'defjs-opentelemetry-server',
  },
  { directory: 'react', name: '@defjs/react', tarball: 'defjs-react' },
  { directory: 'vue', name: '@defjs/vue', tarball: 'defjs-vue' },
] as const

type Manifest = {
  engines?: Record<string, unknown>
  exports?: unknown
  main?: unknown
  name?: unknown
  peerDependencies?: Record<string, unknown>
  peerDependenciesMeta?: Record<string, { optional?: boolean } | undefined>
  types?: unknown
  version?: unknown
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

async function run(command: string[], cwd = repositoryRoot): Promise<void> {
  const process = Bun.spawn(command, { cwd, stderr: 'pipe', stdout: 'pipe' })
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ])

  if (exitCode !== 0) {
    throw new Error(`${command.join(' ')} exited with ${exitCode}\n${stdout}${stderr}`.trim())
  }
}

function assertBuiltExports(packageName: string, value: unknown): void {
  const pending = [value]
  const allowed = new Set(['./index.d.ts', './index.js', './package.json'])

  while (pending.length > 0) {
    const target = pending.pop()
    if (typeof target === 'string') {
      assert(allowed.has(target), `${packageName} exports non-built path ${target}`)
    } else if (target && typeof target === 'object') {
      pending.push(...Object.values(target))
    }
  }
}

await run(['rm', '-rf', packedDirectory, consumerDirectory])
await run(['mkdir', '-p', packedDirectory, consumerDirectory])

const dependencies: Record<string, string> = {
  '@opentelemetry/api': '1.9.1',
  '@opentelemetry/core': '2.10.0',
  '@types/react': '19.2.17',
  react: '19.2.8',
  typescript: '7.0.2',
  vue: '3.5.40',
}
const sourceManifests = new Map<string, Manifest>()

for (const packageInfo of packages) {
  const packageDirectory = `${repositoryRoot}/packages/${packageInfo.directory}`
  const sourceManifest = (await Bun.file(`${packageDirectory}/package.json`).json()) as Manifest
  assert(sourceManifest.name === packageInfo.name, `${packageInfo.directory} source package name is invalid`)
  assert(typeof sourceManifest.version === 'string', `${packageInfo.name} source package version is invalid`)

  const filename = `${packageInfo.tarball}-${sourceManifest.version}.tgz`
  await run(['bun', 'pm', 'pack', '--cwd', `${packageDirectory}/dist`, '--filename', `${packedDirectory}/${filename}`])

  sourceManifests.set(packageInfo.name, sourceManifest)
  dependencies[packageInfo.name] = `file:${packedDirectory}/${filename}`
}

await Bun.write(
  `${consumerDirectory}/package.json`,
  `${JSON.stringify({ dependencies, name: 'defjs-packed-consumer', private: true, type: 'module' }, null, 2)}\n`,
)
await Bun.write(
  `${consumerDirectory}/tsconfig.json`,
  `${JSON.stringify(
    {
      compilerOptions: {
        exactOptionalPropertyTypes: true,
        lib: ['ES2022', 'ESNext.Disposable', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        moduleResolution: 'Bundler',
        noEmit: true,
        skipLibCheck: false,
        strict: true,
        target: 'ES2022',
      },
      include: ['type-consumer.ts'],
    },
    null,
    2,
  )}\n`,
)
await Bun.write(
  `${consumerDirectory}/type-consumer.ts`,
  `import {
  createClient,
  type Client,
  type EventStreamHandle,
  type WebSocketSession,
  type WebSocketSessionLike,
} from '@defjs/core'
import { trace } from '@opentelemetry/api'
import { type OpenTelemetryServerOptions, withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { ClientProvider, type ClientProviderProps } from '@defjs/react'
import { createClientPlugin } from '@defjs/vue'

declare const stream: EventStreamHandle<unknown>
declare const session: WebSocketSession
declare const sessionLike: WebSocketSessionLike

const client: Client = createClient()
const providerProps: ClientProviderProps = { client }
const telemetryOptions: OpenTelemetryServerOptions = { tracer: trace.getTracer('packed-consumer') }
const disposables: readonly AsyncDisposable[] = [stream, session, sessionLike]

async function consumeManagedHandles(): Promise<void> {
  await using streamResource = stream
  await using sessionResource = session
  await using interceptorResource = sessionLike
  void streamResource
  void sessionResource
  void interceptorResource
}

ClientProvider(providerProps)
createClientPlugin(client)
withOpenTelemetryServer(telemetryOptions)
void disposables
void consumeManagedHandles
`,
)
await Bun.write(
  `${consumerDirectory}/runtime-smoke.ts`,
  `import * as core from '@defjs/core'
import * as openTelemetry from '@defjs/opentelemetry-server'
import * as react from '@defjs/react'
import * as vue from '@defjs/vue'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

for (const [name, value] of [
  ['core.createClient', core.createClient],
  ['openTelemetry.withOpenTelemetryServer', openTelemetry.withOpenTelemetryServer],
  ['react.ClientProvider', react.ClientProvider],
  ['react.useClient', react.useClient],
  ['vue.createClientPlugin', vue.createClientPlugin],
  ['vue.injectClient', vue.injectClient],
] as const) {
  assert(typeof value === 'function', name + ' is not a function')
}

let receivedRequest: Request | undefined
const client = core.createClient(
  core.withEndpoint('https://example.test'),
  core.withHTTPHandle(async (input) => {
    assert(input instanceof Request, 'Core did not pass a standard Request to the fetch handle')
    receivedRequest = input
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })
  }),
)
const readHealth = core.defineRequest({
  method: 'GET',
  output: { 200: core.struct.object({ ok: core.struct.literal(true) }) },
  path: '/health',
  responseType: 'json',
})
const [error, result, response] = await client.execute(readHealth())

assert(error === null, 'Core request failed')
assert(result?.ok === true, 'Core request returned the wrong body')
assert(response?.status === 200, 'Core request returned the wrong status')
assert(receivedRequest?.url === 'https://example.test/health', 'Core request used the wrong URL')
`,
)

await run(['bun', 'install', '--ignore-scripts'], consumerDirectory)

for (const packageInfo of packages) {
  const sourceManifest = sourceManifests.get(packageInfo.name)
  assert(sourceManifest, `${packageInfo.name} source manifest is missing`)
  const installedDirectory = `${consumerDirectory}/node_modules/${packageInfo.name}`
  const installedPath = `${installedDirectory}/package.json`
  const manifestText = await Bun.file(installedPath).text()
  const installedManifest = JSON.parse(manifestText) as Manifest

  assert(await Bun.file(`${installedDirectory}/README.md`).exists(), `${packageInfo.name} package is missing README.md`)
  assert(await Bun.file(`${installedDirectory}/LICENSE`).exists(), `${packageInfo.name} package is missing LICENSE`)
  assert(installedManifest.name === sourceManifest.name, `${packageInfo.name} installed name does not match source`)
  assert(installedManifest.version === sourceManifest.version, `${packageInfo.name} installed version does not match source`)
  assert(installedManifest.main === './index.js', `${packageInfo.name} main must be ./index.js`)
  assert(installedManifest.types === './index.d.ts', `${packageInfo.name} types must be ./index.d.ts`)
  assert(!manifestText.includes('workspace:'), `${packageInfo.name} retains a workspace: protocol`)
  assert(!manifestText.includes('catalog:'), `${packageInfo.name} retains a catalog: protocol`)
  assert(!installedManifest.engines || !('node' in installedManifest.engines), `${packageInfo.name} retains engines.node`)
  assertBuiltExports(packageInfo.name, installedManifest.exports)

  if (packageInfo.name !== '@defjs/core') {
    assert(installedManifest.peerDependencies?.['@defjs/core'] === '^0.4.0', `${packageInfo.name} must require @defjs/core ^0.4.0`)
    assert(
      installedManifest.peerDependenciesMeta?.['@defjs/core']?.optional !== true,
      `${packageInfo.name} must expose @defjs/core as a required peer`,
    )
  }
}

await run(['bun', 'run', 'tsc', '--project', 'tsconfig.json'], consumerDirectory)
await run(['bun', 'run', 'runtime-smoke.ts'], consumerDirectory)

console.log(`Packed consumer verified with Bun ${Bun.version}`)

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { lstat, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

const packagePatterns = [
  ['@defjs/core', /^defjs-core-.+\.tgz$/],
  ['@defjs/react', /^defjs-react-.+\.tgz$/],
  ['@defjs/vue', /^defjs-vue-.+\.tgz$/],
  ['@defjs/opentelemetry-server', /^defjs-opentelemetry-server-.+\.tgz$/],
]

// Vite 8.1.5 baseline: 14,326 B gzip; 16 KiB leaves 14% headroom for toolchain drift.
const httpGzipBudgetBytes = 16 * 1_024
const realtimeSentinels = [
  ['WebSocket', 'globalThis.WebSocket'],
  ['heartbeat', 'heartbeat'],
  ['maxIncomingQueueSize', 'maxIncomingQueueSize'],
  ['maxQueueSize', 'maxQueueSize'],
  ['reconnect', 'reconnect'],
  ['text/event-stream', 'text/event-stream'],
]

const indexSource = `import {
  createHttpInterceptor,
  defineEventStream,
  defineRequest,
  defineWebSocket,
  struct,
  withEndpoint,
  withInterceptors,
} from '@defjs/core'
import { createHttpClient } from '@defjs/core/http'

const inventoryPath = struct.request({ path: struct.object({ sku: struct.string() }) })
const sseLimits = { maxBufferSize: 65_536, maxQueueSize: 16 }
const webSocketLimits = { maxIncomingQueueSize: 16, maxOutgoingQueueSize: 4 }

export const getInventory = defineRequest({
  method: 'GET',
  path: '/inventory/:sku',
  input: inventoryPath,
  output: { 200: struct.object({ available: struct.number(), sku: struct.string() }) },
  responseType: 'json',
})

export const inventoryEvents = defineEventStream({
  ...sseLimits,
  path: '/inventory/:sku/events',
  input: inventoryPath,
  events: { changed: struct.object({ available: struct.number(), sku: struct.string() }) },
})

export const inventorySocket = defineWebSocket({
  ...webSocketLimits,
  path: '/inventory/:sku/socket',
  input: inventoryPath,
  incoming: { changed: struct.object({ available: struct.number(), sku: struct.string() }) },
  outgoing: { watch: struct.object({ sku: struct.string() }) },
})

const optionalQuery = defineRequest({
  method: 'GET',
  path: '/optional',
  input: struct.request({ query: struct.object({ q: struct.string().optional() }) }),
})

optionalQuery({})
// @ts-expect-error exactOptionalPropertyTypes rejects an explicitly undefined optional section
optionalQuery({ query: undefined })

const httpInterceptor = createHttpInterceptor((request, next) => next(request))
export const httpOnlyClient = createHttpClient(withEndpoint('https://example.test'), withInterceptors(httpInterceptor))
`

const runtimeSource = `import assert from 'node:assert/strict'
import { createClient, defineRequest, struct, withEndpoint, withHTTPHandle } from '@defjs/core'
import * as react from '@defjs/react'
import * as vue from '@defjs/vue'
import * as openTelemetry from '@defjs/opentelemetry-server'

assert.equal(typeof react.ClientProvider, 'function')
assert.equal(typeof react.useClient, 'function')
assert.equal(typeof vue.createClientPlugin, 'function')
assert.equal(typeof vue.injectClient, 'function')
assert.equal(typeof openTelemetry.withOpenTelemetryServer, 'function')

let fetchCalls = 0
const fakeFetch = async (input) => {
  fetchCalls += 1
  const url = input instanceof Request ? input.url : String(input)
  if (url === 'https://example.test/empty') {
    return new Response(null, { status: 204 })
  }
  assert.equal(url, 'https://example.test/health')
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  })
}

const readHealth = defineRequest({
  method: 'GET',
  path: '/health',
  output: { 200: struct.object({ ok: struct.boolean() }) },
  responseType: 'json',
})
const client = createClient(withEndpoint('https://example.test'), withHTTPHandle(fakeFetch))
const [error, result, response] = await client.execute(readHealth())

assert.equal(error, null)
assert.equal(result?.ok, true)
assert.equal(response?.status, 200)

const clearHealth = defineRequest({
  method: 'DELETE',
  path: '/empty',
  output: { 204: struct.null() },
  responseType: 'json',
})
const [emptyError, emptyResult, emptyResponse] = await client.execute(clearHealth())

assert.equal(emptyError, null)
assert.equal(emptyResult, null)
assert.equal(emptyResponse?.status, 204)
assert.equal(fetchCalls, 2)

try {
  delete Object.prototype.polluted
  const [structError] = struct.parse(
    struct.record(struct.record(struct.string())),
    JSON.parse('{"__proto__":{"polluted":7}}'),
  )
  assert.ok(structError)

  const formatted = structError.format()
  const flattened = structError.flatten()
  assert.equal(Object.getPrototypeOf(formatted), null)
  assert.equal(Object.hasOwn(formatted, '__proto__'), true)
  assert.equal(Object.getPrototypeOf(flattened.fieldErrors), null)
  assert.equal(Object.hasOwn(flattened.fieldErrors, '__proto__'), true)
  assert.equal(Object.hasOwn(Object.prototype, 'polluted'), false)
} finally {
  delete Object.prototype.polluted
}
`

function viteHttpSource(packageName, clientFactory) {
  return `import {
  ${clientFactory} as createConsumerClient,
  defineRequest,
  struct,
  withEndpoint,
  withHTTPHandle,
} from '${packageName}'

function assertEqual(actual, expected, message) {
  if (!Object.is(actual, expected)) {
    throw new Error(message + ': expected ' + String(expected) + ', received ' + String(actual))
  }
}

const products = defineRequest({
  method: 'GET',
  path: '/products',
  input: struct.request({ query: struct.object({ scenario: struct.string() }) }),
  output: [
    { status: 200, body: struct.object({ ok: struct.boolean() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ],
  responseType: 'json',
})

export async function runPackedHttpAcceptance() {
  let fetchCalls = 0
  const handle = async (input) => {
    fetchCalls += 1
    const request = input instanceof Request ? input : new Request(input)
    const scenario = new URL(request.url).searchParams.get('scenario')
    if (scenario === 'malformed') {
      return new Response(JSON.stringify({ ok: 'yes' }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })
    }
    if (scenario === 'missing') {
      return new Response(JSON.stringify({ message: 'not found' }), {
        headers: { 'content-type': 'application/json' },
        status: 404,
      })
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })
  }
  const client = createConsumerClient(withEndpoint('https://example.test'), withHTTPHandle(handle))

  const [successError, success, successResponse] = await client.execute(products({ query: { scenario: 'ok' } }))
  assertEqual(successError, null, 'valid 200 error')
  assertEqual(success?.ok, true, 'valid 200 body')
  assertEqual(successResponse?.status, 200, 'valid 200 status')

  const [malformedError, malformed, malformedResponse] = await client.execute(products({ query: { scenario: 'malformed' } }))
  assertEqual(malformedError?.kind, 'definition', 'malformed 200 error kind')
  assertEqual(malformedError?.code, 'RESPONSE_VALIDATION_FAILED', 'malformed 200 error code')
  assertEqual(malformed, undefined, 'malformed 200 body')
  assertEqual(malformedResponse?.status, 200, 'malformed 200 status')

  const [missingError, missing, missingResponse] = await client.execute(products({ query: { scenario: 'missing' } }))
  assertEqual(missingError?.kind, 'http', '404 error kind')
  assertEqual(missingError?.status, 404, '404 error status')
  assertEqual(missingError?.data?.message, 'not found', '404 error body')
  assertEqual(missing, undefined, '404 success body')
  assertEqual(missingResponse?.status, 404, '404 response status')
  assertEqual(fetchCalls, 3, 'fetch call count')
}
`
}

const viteConfigSource = `import { defineConfig } from 'vite'

const entries = {
  http: 'vite-http.ts',
  root: 'vite-root.ts',
}

export default defineConfig(({ mode }) => {
  const entry = entries[mode]
  if (!entry) {
    throw new Error('Unsupported packed-consumer Vite mode: ' + mode)
  }

  return {
    build: {
      emptyOutDir: true,
      lib: { entry, fileName: 'index', formats: ['es'] },
      minify: 'oxc',
      outDir: 'dist/vite-' + mode,
      reportCompressedSize: false,
      sourcemap: false,
      target: 'es2022',
    },
  }
})
`

const tsconfig = {
  compilerOptions: {
    declaration: true,
    emitDeclarationOnly: true,
    exactOptionalPropertyTypes: true,
    lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    outDir: 'dist',
    rootDir: '.',
    strict: true,
    target: 'ES2022',
    types: [],
    verbatimModuleSyntax: true,
  },
  include: ['index.ts'],
}

const repositoryRoot = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
const packageDirectoryInput = resolve(process.argv[2] ?? '')
let packageDirectory
let consumerDirectory

try {
  if (!process.argv[2] || !(await stat(packageDirectoryInput)).isDirectory()) {
    throw new TypeError('Usage: node scripts/verify-packed-consumer.mjs <tarball-directory>')
  }
  packageDirectory = await realpath(packageDirectoryInput)

  const entries = await readdir(packageDirectory)
  const tarballs = packagePatterns.map(([packageName, pattern]) => {
    const matches = entries.filter((entry) => pattern.test(entry))
    if (matches.length !== 1) {
      throw new Error(`Expected exactly one ${packageName} tarball in ${packageDirectory}, found ${matches.length}`)
    }
    return join(packageDirectory, matches[0])
  })

  consumerDirectory = await realpath(await mkdtemp(join(tmpdir(), 'defjs-packed-consumer-')))
  assert.equal(isInside(repositoryRoot, consumerDirectory), false, 'Consumer must be outside the repository')

  await Promise.all([
    writeFile(
      join(consumerDirectory, 'package.json'),
      `${JSON.stringify({ name: 'defjs-packed-consumer', private: true, type: 'module' }, null, 2)}\n`,
    ),
    writeFile(join(consumerDirectory, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`),
    writeFile(join(consumerDirectory, 'index.ts'), indexSource),
    writeFile(join(consumerDirectory, 'runtime.mjs'), runtimeSource),
    writeFile(join(consumerDirectory, 'vite-http.ts'), viteHttpSource('@defjs/core/http', 'createHttpClient')),
    writeFile(join(consumerDirectory, 'vite-root.ts'), viteHttpSource('@defjs/core', 'createClient')),
    writeFile(join(consumerDirectory, 'vite.config.mjs'), viteConfigSource),
  ])

  await run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--no-package-lock',
      ...tarballs,
      'typescript@7.0.2',
      'react@19.2.8',
      '@types/react@19.2.17',
      'vue@3.5.13',
      '@opentelemetry/api@1.9.0',
      '@opentelemetry/core@2.0.0',
      'vite@8.1.5',
    ],
    consumerDirectory,
  )
  await run(process.execPath, ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.json'], consumerDirectory)
  await verifyDeclarations(join(consumerDirectory, 'dist'), [repositoryRoot, packageDirectory])
  await run(process.execPath, ['runtime.mjs'], consumerDirectory)
  await runOptional('bun', ['run', 'runtime.mjs'], consumerDirectory)
  await runOptional('deno', ['run', '--node-modules-dir=manual', '--allow-env=NODE_ENV', 'runtime.mjs'], consumerDirectory)
  await run(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--mode', 'root'], consumerDirectory)
  await run(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--mode', 'http'], consumerDirectory)
  await verifyViteHttpEntries(consumerDirectory)
  await verifyInstalledPackages(consumerDirectory)

  console.log(`Packed consumer verified with Node ${process.version}`)
} finally {
  if (consumerDirectory) {
    await rm(consumerDirectory, { force: true, recursive: true })
  }
}

function isInside(parent, child) {
  const path = relative(parent, child)
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path))
}

function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      reject(new Error(`${command} exited with ${code ?? `signal ${signal}`}`))
    })
  })
}

async function runOptional(command, args, cwd) {
  try {
    await run(command, args, cwd)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      console.log(`Optional runtime skipped: ${command} is not installed`)
      return
    }
    throw error
  }
}

async function verifyViteHttpEntries(directory) {
  const root = await inspectViteEntry(directory, 'root')
  const http = await inspectViteEntry(directory, 'http')

  await (await import(pathToFileURL(root.file).href)).runPackedHttpAcceptance()
  await (await import(pathToFileURL(http.file).href)).runPackedHttpAcceptance()

  console.log(
    `Packed Vite HTTP bundles: root=${root.bytes} B/${root.gzipBytes} B gzip [${root.markers.join(', ') || 'no realtime markers'}], ` +
      `http=${http.bytes} B/${http.gzipBytes} B gzip [${http.markers.join(', ') || 'no realtime markers'}]`,
  )

  assert.ok(http.gzipBytes <= httpGzipBudgetBytes, `HTTP entry exceeds ${httpGzipBudgetBytes} B gzip budget`)
  assert.deepEqual(http.markers, [], 'HTTP entry contains realtime runtime markers')
}

async function inspectViteEntry(directory, name) {
  const outputDirectory = join(directory, 'dist', `vite-${name}`)
  const files = (await readdir(outputDirectory, { recursive: true })).filter((file) => /\.(?:m?js)$/u.test(file))
  assert.equal(files.length, 1, `Expected one Vite JavaScript artifact for ${name}, found ${files.length}`)

  const file = join(outputDirectory, files[0])
  const source = await readFile(file)
  return {
    bytes: source.byteLength,
    file,
    gzipBytes: gzipSync(source).byteLength,
    markers: realtimeSentinels.filter(([, sentinel]) => source.includes(sentinel)).map(([name]) => name),
  }
}

async function verifyDeclarations(directory, forbiddenPaths) {
  const files = (await readdir(directory, { recursive: true })).filter((file) => file.endsWith('.d.ts'))
  assert.ok(files.length > 0, 'TypeScript emitted no declarations')

  for (const file of files) {
    const declaration = (await readFile(join(directory, file), 'utf8')).replaceAll('\\', '/')
    assert.equal(declaration.includes('/src/'), false, `${file} contains a source-path import`)
    for (const forbiddenPath of forbiddenPaths) {
      assert.equal(declaration.includes(forbiddenPath.replaceAll('\\', '/')), false, `${file} contains workspace path ${forbiddenPath}`)
    }
  }
}

async function verifyInstalledPackages(directory) {
  for (const [packageName] of packagePatterns) {
    const packageRoot = await realpath(join(directory, 'node_modules', packageName))
    assert.equal(isInside(directory, packageRoot), true, `${packageName} resolved outside the temporary consumer`)
    const manifest = await readFile(join(packageRoot, 'package.json'), 'utf8')
    const packageManifest = JSON.parse(manifest)
    assert.equal(/(?:workspace|link):/.test(manifest), false, `${packageName} retains a workspace-only dependency`)
    assert.equal(packageManifest.engines?.node, '>=22', `${packageName} must declare Node >=22`)
    assert.equal(packageManifest.main, './index.js', `${packageName} must expose a built runtime entry`)
    assert.equal(packageManifest.types, './index.d.ts', `${packageName} must expose built declarations`)
    assert.equal(JSON.stringify(packageManifest.exports).includes('/src/'), false, `${packageName} exports a source runtime entry`)

    const readme = await readFile(join(packageRoot, 'README.md'), 'utf8')
    for (const phrase of ['source/workspace', 'workspace source', 'public npm provides']) {
      assert.equal(readme.toLowerCase().includes(phrase), false, `${packageName} README retains consumer-hostile ${phrase} context`)
    }
    assert.equal(/`packages\/[^`]+`/.test(readme), false, `${packageName} README points at an unpacked workspace path`)
    for (const requiredPath of [
      'docs/core/http.md',
      'docs/plugins/opentelemetry-server.md',
      'docs/plugins/react.md',
      'docs/plugins/vue.md',
    ]) {
      await stat(join(packageRoot, requiredPath))
    }

    const packageFiles = await readdir(packageRoot, { recursive: true })
    assert.equal(
      packageFiles.some((file) => file.split(/[\\/]/u).includes('node_modules')),
      false,
      `${packageName} contains a nested node_modules tree`,
    )
    for (const file of packageFiles) {
      assert.equal((await lstat(join(packageRoot, file))).isSymbolicLink(), false, `${packageName} contains a symbolic link: ${file}`)
    }

    const markdownFiles = packageFiles.filter((file) => file.endsWith('.md'))
    for (const file of markdownFiles) {
      const markdown = await readFile(join(packageRoot, file), 'utf8')
      assert.equal(
        /https?:\/\/github\.com\/(?:defjs|MunMunMiao)\/defjs\/(?:blob|tree)\//iu.test(markdown),
        false,
        `${packageName} ${file} relies on repository-only documentation`,
      )
      await verifyMarkdownLinks(packageName, packageRoot, file, markdown)
    }
  }
}

async function verifyMarkdownLinks(packageName, packageRoot, file, markdown) {
  for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const href = match[1].trim().split(/\s+/u, 1)[0]
    if (!href || /^(?:#|https?:|mailto:)/u.test(href)) {
      continue
    }

    assert.equal(href.startsWith('/'), false, `${packageName} ${file} uses a site-root-only link: ${href}`)
    const relativeTarget = decodeURIComponent(href.split('#', 1)[0])
    const target = resolve(dirname(join(packageRoot, file)), relativeTarget)
    assert.equal(isInside(packageRoot, target), true, `${packageName} ${file} link escapes the installed package: ${href}`)
    try {
      await stat(target)
    } catch {
      assert.fail(`${packageName} ${file} link is missing from the installed package: ${href}`)
    }
  }
}

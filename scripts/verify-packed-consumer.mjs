import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { lstat, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const packagePatterns = [
  ['@defjs/core', /^defjs-core-.+\.tgz$/],
  ['@defjs/react', /^defjs-react-.+\.tgz$/],
  ['@defjs/vue', /^defjs-vue-.+\.tgz$/],
  ['@defjs/opentelemetry-server', /^defjs-opentelemetry-server-.+\.tgz$/],
]

const indexSource = `import { defineEventStream, defineRequest, defineWebSocket, struct } from '@defjs/core'

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
`

const runtimeSource = `import assert from 'node:assert/strict'
import { createClient, defineRequest, struct, withEndpoint, withHTTPHandle } from '@defjs/core'
import * as react from '@defjs/react'
import * as vue from '@defjs/vue'
import * as openTelemetry from '@defjs/opentelemetry-server'

assert.equal(typeof react.withEndpoint, 'function')
assert.equal(typeof vue.withEndpoint, 'function')
assert.equal(typeof openTelemetry.withOpenTelemetryServer, 'function')

let fetchCalls = 0
const fakeFetch = async (input) => {
  fetchCalls += 1
  const url = input instanceof Request ? input.url : String(input)
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
assert.equal(fetchCalls, 1)
`

const tsconfig = {
  compilerOptions: {
    declaration: true,
    emitDeclarationOnly: true,
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
    ],
    consumerDirectory,
  )
  await run(process.execPath, ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.json'], consumerDirectory)
  await verifyDeclarations(join(consumerDirectory, 'dist'), [repositoryRoot, packageDirectory])
  await verifyInstalledPackages(consumerDirectory)
  await run(process.execPath, ['runtime.mjs'], consumerDirectory)

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
    assert.equal(/(?:workspace|link):/.test(manifest), false, `${packageName} retains a workspace-only dependency`)
    assert.equal(JSON.parse(manifest).engines?.node, '>=22', `${packageName} must declare Node >=22`)

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

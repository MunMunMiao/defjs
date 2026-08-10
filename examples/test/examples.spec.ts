import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const execFileAsync = promisify(execFile)
const examplesRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const expectedResultPattern = /## Expected result\s+```text\s*\n([^\n]+)\n```/g

type ExampleManifest = {
  name?: unknown
  private?: unknown
  scripts?: unknown
}

type ExampleCase = {
  directory: string
  expected: unknown
  manifest: ExampleManifest
  readme: string
  source: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readExampleCases(): Promise<ExampleCase[]> {
  const entries = await readdir(examplesRoot, { withFileTypes: true })
  const directories = entries
    .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'test')
    .map((entry) => entry.name)
    .sort()

  const packages: Array<{ directory: string; manifest: ExampleManifest }> = []
  for (const directory of directories) {
    const manifest = JSON.parse(await readFile(resolve(examplesRoot, directory, 'package.json'), 'utf8')) as ExampleManifest
    if (typeof manifest.name === 'string' && manifest.name.startsWith('@defjs/example-')) {
      packages.push({ directory, manifest })
    }
  }

  return Promise.all(
    packages.map(async ({ directory, manifest }) => {
      const exampleRoot = resolve(examplesRoot, directory)
      const [readme, source] = await Promise.all([
        readFile(resolve(exampleRoot, 'README.md'), 'utf8'),
        readFile(resolve(exampleRoot, 'src/index.ts'), 'utf8'),
      ])
      const matches = [...readme.matchAll(expectedResultPattern)]

      expect(matches, `${directory} must declare exactly one Expected result`).toHaveLength(1)

      const expectedResult = matches[0]?.[1]
      if (expectedResult === undefined) {
        throw new Error(`${directory} Expected result is empty`)
      }

      return {
        directory,
        expected: JSON.parse(expectedResult) as unknown,
        manifest,
        readme,
        source,
      }
    }),
  )
}

const examples = await readExampleCases()

describe('examples workspace contract', () => {
  test('contains the documented example set', () => {
    expect(examples).toHaveLength(76)
  })

  test.each(examples)('$directory has a valid executable example package', ({ directory, manifest, readme, source }) => {
    expect(manifest.private, `${directory} must remain private`).toBe(true)
    expect(manifest.name).toBe(`@defjs/example-${directory}`)
    expect(manifest.scripts).toEqual({ start: 'tsx src/index.ts' })
    expect(readme).toContain('## Expected result')
    expect(source).toContain('export async function main(): Promise<void>')
    expect(source).toContain('if (import.meta.main)')
  })
})

describe('example scenarios', () => {
  test.each(examples)('$directory matches its documented result', async ({ directory, expected }) => {
    const exampleRoot = resolve(examplesRoot, directory)
    let stdout = ''
    let stderr = ''
    let exitCode: number | string = 0

    try {
      const result = await execFileAsync(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
        cwd: exampleRoot,
        encoding: 'utf8',
        timeout: 30_000,
      })
      stdout = result.stdout
      stderr = result.stderr
    } catch (error) {
      if (!isRecord(error)) throw error
      stdout = typeof error['stdout'] === 'string' ? error['stdout'] : ''
      stderr = typeof error['stderr'] === 'string' ? error['stderr'] : String(error)
      exitCode = typeof error['code'] === 'number' || typeof error['code'] === 'string' ? error['code'] : 'unknown'
    }

    expect(exitCode).toBe(0)
    expect(stderr).toBe('')

    const lines = stdout.trim().split(/\r?\n/)
    expect(lines, `${directory} must print exactly one JSON line`).toHaveLength(1)

    const actualLine = lines[0]
    if (actualLine === undefined) {
      throw new Error(`${directory} did not print a result`)
    }

    expect(JSON.parse(actualLine)).toEqual(expected)
  })
})

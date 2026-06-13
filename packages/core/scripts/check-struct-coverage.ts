import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

type CounterMap = Record<string, number>
type BranchCounterMap = Record<string, number[]>

interface StatementLocation {
  start: { line: number }
}

interface CoverageEntry {
  readonly path: string
  readonly statementMap: Record<string, StatementLocation>
  readonly s: CounterMap
  readonly f: CounterMap
  readonly b: BranchCounterMap
}

interface CoverageMetric {
  readonly covered: number
  readonly total: number
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const coreRoot = resolve(scriptDir, '..')
const structRoot = join(coreRoot, 'src', 'struct')
const coveragePath = join(coreRoot, 'coverage', 'coverage-final.json')

// Keep this list limited to pure barrels or type-only files. If a file gains runtime logic, remove it from this set and cover it.
const IGNORED_RUNTIME_FILES = new Set(['codec/index.ts', 'index.ts', 'public_api.ts', 'struct.ts', 'types.ts'])

function toPosixPath(path: string): string {
  return path.split(sep).join('/')
}

function collectRuntimeFiles(root: string): string[] {
  const files: string[] = []

  for (const entry of readdirSync(root)) {
    const path = join(root, entry)
    const stat = statSync(path)

    if (stat.isDirectory()) {
      files.push(...collectRuntimeFiles(path))
      continue
    }

    if (!stat.isFile() || extname(path) !== '.ts') {
      continue
    }

    const name = basename(path)
    const relativePath = toPosixPath(relative(structRoot, path))
    if (name.includes('.spec.') || name.endsWith('.type.test.ts') || IGNORED_RUNTIME_FILES.has(relativePath)) {
      continue
    }

    files.push(resolve(path))
  }

  return files.sort()
}

function readCoverage(): Map<string, CoverageEntry> {
  if (!existsSync(coveragePath)) {
    throw new Error(`missing coverage file: ${coveragePath}`)
  }

  const raw = JSON.parse(readFileSync(coveragePath, 'utf8')) as Record<string, CoverageEntry>
  return new Map(Object.values(raw).map((entry) => [resolve(entry.path), entry]))
}

function countMap(values: CounterMap): CoverageMetric {
  const counters = Object.values(values)
  return {
    covered: counters.filter((count) => count > 0).length,
    total: counters.length,
  }
}

function countBranches(values: BranchCounterMap): CoverageMetric {
  const counters = Object.values(values).flat()
  return {
    covered: counters.filter((count) => count > 0).length,
    total: counters.length,
  }
}

function countLines(entry: CoverageEntry): CoverageMetric {
  const lines = new Map<number, boolean>()

  for (const [statementId, location] of Object.entries(entry.statementMap)) {
    const line = location.start.line
    lines.set(line, (lines.get(line) ?? false) || entry.s[statementId] > 0)
  }

  const covered = [...lines.values()].filter(Boolean).length
  return {
    covered,
    total: lines.size,
  }
}

function assertCompleteMetric(file: string, metricName: string, metric: CoverageMetric): string | undefined {
  if (metric.total === 0 || metric.covered === metric.total) {
    return undefined
  }

  return `${toPosixPath(relative(coreRoot, file))}: ${metricName} ${metric.covered}/${metric.total}`
}

function main(): void {
  const expectedFiles = collectRuntimeFiles(structRoot)
  const coverage = readCoverage()
  const failures: string[] = []

  for (const file of expectedFiles) {
    const entry = coverage.get(file)
    if (!entry) {
      failures.push(`${toPosixPath(relative(coreRoot, file))}: missing from coverage-final.json`)
      continue
    }

    const metrics = [
      ['statements', countMap(entry.s)],
      ['branches', countBranches(entry.b)],
      ['functions', countMap(entry.f)],
      ['lines', countLines(entry)],
    ] as const

    for (const [name, metric] of metrics) {
      const failure = assertCompleteMetric(file, name, metric)
      if (failure) {
        failures.push(failure)
      }
    }
  }

  if (failures.length > 0) {
    console.error(['struct coverage gate failed:', ...failures.map((item) => `- ${item}`)].join('\n'))
    process.exitCode = 1
    return
  }

  console.log(`struct coverage gate passed: ${expectedFiles.length} runtime files covered at 100%`)
}

main()

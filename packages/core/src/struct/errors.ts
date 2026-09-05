import type { FlattenedStructError, FormattedStructError, Path, StructIssue } from './types'
import { describeValue, formatPath } from './utils'

/**
 * Optional callback that rewrites a `StructIssue` message before it is stored.
 *
 * Return a string to replace the default message, or `undefined` to keep it.
 *
 * @param issue - Issue about to be recorded.
 * @returns Replacement message, or `undefined` to keep the default.
 */
export type ErrorMap = (issue: StructIssue) => string | undefined

/**
 * Aggregate of one or more `StructIssue`s from a failed parse.
 *
 * Use `format()`, `flatten()`, or `prettify()` to present issues to callers.
 */
export class StructError extends Error {
  /** Issues collected for this failure, in encounter order. */
  readonly issues: StructIssue[]

  /**
   * @param issues - Non-empty list of parse issues (empty lists still produce a generic message).
   */
  constructor(issues: StructIssue[]) {
    const first = issues[0]?.message
    super(issues.length <= 1 ? (first ?? 'Struct parse failed') : `${issues.length} struct issues: ${first}`)
    this.name = 'StructError'
    this.issues = issues
  }

  /**
   * Build a nested error tree keyed by path segments.
   *
   * @returns A `FormattedStructError` with `_errors` arrays at each node.
   */
  format(): FormattedStructError {
    const root = createFormattedError()
    for (const item of this.issues) {
      let cursor: FormattedStructError = root
      for (const segment of item.path) {
        const key = formatErrorTreeKey(segment)
        const existing = cursor[key]
        if (Object.hasOwn(cursor, key) && existing && !Array.isArray(existing)) {
          cursor = existing
        } else {
          const next = createFormattedError()
          cursor[key] = next
          cursor = next
        }
      }
      cursor._errors.push(item.message)
    }
    return root
  }

  /**
   * Split issues into root `formErrors` and first-segment `fieldErrors`.
   *
   * @returns Flat bags suitable for form libraries.
   */
  flatten(): FlattenedStructError {
    const formErrors: string[] = []
    const fieldErrors: { [key: string]: string[] } = Object.create(null)
    for (const item of this.issues) {
      if (item.path.length === 0) {
        formErrors.push(item.message)
        continue
      }
      const key = String(item.path[0])
      ;(fieldErrors[key] ??= []).push(item.message)
    }
    return { fieldErrors, formErrors }
  }

  /**
   * Render a multi-line, human-readable summary of all issues.
   *
   * @returns One `× path: message` line per issue.
   */
  prettify(): string {
    if (this.issues.length === 0) {
      return 'Struct parse failed'
    }
    return this.issues
      .map((item) => {
        const where = item.path.length === 0 ? '<root>' : formatPath(item.path)
        return `× ${where}: ${item.message}`
      })
      .join('\n')
  }
}

function createFormattedError(): FormattedStructError {
  return Object.assign(Object.create(null), { _errors: [] as string[] })
}

function formatErrorTreeKey(segment: number | string): string {
  const key = String(segment)
  return key === '_errors' ? '\\_errors' : key
}

let activeErrorMap: ErrorMap | undefined

export function hasErrorMap(): boolean {
  return activeErrorMap !== undefined
}

export function runWithErrorMap<T>(map: ErrorMap | undefined, run: () => T): T {
  const previous = activeErrorMap
  activeErrorMap = map
  try {
    return run()
  } finally {
    activeErrorMap = previous
  }
}

export function issue(path: Path, code: StructIssue['code'], expected: string, received: unknown, message?: string): StructIssue {
  const candidate: StructIssue = {
    code,
    expected,
    message: message ?? `Expected ${expected} at ${formatPath(path)}, received ${describeValue(received)}`,
    path,
    received,
  }
  if (activeErrorMap) {
    const override = activeErrorMap(candidate)
    if (override) {
      candidate.message = override
    }
  }
  return candidate
}

import type { FlattenedStructError, FormattedStructError, Path, StructIssue } from './types'
import { describeValue, formatPath } from './utils'

export type ErrorMap = (issue: StructIssue) => string | undefined

let globalErrorMap: ErrorMap | undefined

export function setErrorMap(map: ErrorMap | undefined): void {
  globalErrorMap = map
}

export class StructError extends Error {
  readonly issues: StructIssue[]

  constructor(issues: StructIssue[]) {
    const first = issues[0]?.message
    super(issues.length <= 1 ? (first ?? 'Struct parse failed') : `${issues.length} struct issues: ${first}`)
    this.name = 'StructError'
    this.issues = issues
  }

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

export function issue(path: Path, code: StructIssue['code'], expected: string, received: unknown, message?: string): StructIssue {
  const candidate: StructIssue = {
    code,
    expected,
    message: message ?? `Expected ${expected} at ${formatPath(path)}, received ${describeValue(received)}`,
    path,
    received,
  }
  if (globalErrorMap) {
    const override = globalErrorMap(candidate)
    if (override) {
      candidate.message = override
    }
  }
  return candidate
}

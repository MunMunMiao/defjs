import type { DefjsErrorCode } from './codes'

export function hasErrorCode(error: unknown, code: DefjsErrorCode): boolean {
  return error === code || (error instanceof Error && (error.message === code || ('code' in error && error.code === code)))
}

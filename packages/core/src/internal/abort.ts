import type { DefinitionError } from '../error'
import { createDefinitionError } from '../error'

export const ABORT_TIMEOUT_CONFLICT_MESSAGE = 'with.abort and with.timeout cannot be used together'

export type UseCancellationConfig =
  | {
      abort?: AbortSignal
      timeout?: never
    }
  | {
      abort?: never
      timeout?: number
    }

export interface CancellationConfigLike {
  abort?: unknown
  timeout?: unknown
}

export function hasAbortTimeoutConflict(config: CancellationConfigLike | undefined): boolean {
  return config !== undefined && config.abort !== undefined && config.timeout !== undefined
}

export function createAbortTimeoutConflictError(): DefinitionError {
  return createDefinitionError('REQUEST_VALIDATION_FAILED', new Error(ABORT_TIMEOUT_CONFLICT_MESSAGE))
}

export function mergeAbortSignals(controller: AbortSignal, signals: (AbortSignal | undefined)[], timeout?: number): AbortSignal {
  const hasTimeout = typeof timeout === 'number' && timeout > 0
  const merged: AbortSignal[] = [controller]

  for (const signal of signals) {
    if (signal) {
      merged.push(signal)
    }
  }

  if (!hasTimeout && merged.length === 1) {
    return controller
  }

  if (hasTimeout) {
    merged.push(AbortSignal.timeout(timeout))
  }

  return AbortSignal.any(merged)
}

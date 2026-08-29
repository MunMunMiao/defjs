import type { DefinitionError, TransportError } from '../error'
import { createDefinitionError, createTransportError, ERR_ABORTED, ERR_TIMEOUT } from '../error'

export const ABORT_TIMEOUT_CONFLICT_MESSAGE = 'abort and timeout cannot be used together'
const MAX_TIMER_DELAY_MS = 2_147_483_647

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
  signal?: unknown
  timeout?: unknown
}

export interface CancellationConfigSnapshot {
  abort?: AbortSignal
  signal?: AbortSignal
  timeout?: number
}

export function snapshotCancellationConfig(config: CancellationConfigSnapshot): CancellationConfigSnapshot {
  return {
    abort: config.abort,
    signal: config.signal,
    timeout: config.timeout,
  }
}

export function hasAbortTimeoutConflict(config: CancellationConfigLike | undefined): boolean {
  return config !== undefined && config.abort !== undefined && config.timeout !== undefined
}

export function createAbortTimeoutConflictError(): DefinitionError {
  return createDefinitionError('REQUEST_VALIDATION_FAILED', new Error(ABORT_TIMEOUT_CONFLICT_MESSAGE))
}

export function resolveAbortTransportError(signal: AbortSignal): TransportError | undefined {
  if (!signal.aborted) {
    return undefined
  }

  return resolveAbortedTransportError(signal)
}

export function resolveAbortedTransportError(signal: AbortSignal): TransportError {
  const reason = signal.reason
  const timedOut = reason === ERR_TIMEOUT || (reason instanceof Error && reason.name === 'TimeoutError')

  return createTransportError(timedOut ? ERR_TIMEOUT : ERR_ABORTED)
}

export function validateTransportTimeout(timeout: number | undefined): void {
  if (typeof timeout !== 'undefined' && (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > MAX_TIMER_DELAY_MS)) {
    throw new RangeError(`Request timeout must be a positive safe integer no greater than ${MAX_TIMER_DELAY_MS}`)
  }
}

export async function awaitWithSignal<T>(run: () => T | PromiseLike<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()

  let rejectAbort!: (reason?: unknown) => void
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject
  })
  const onAbort = () => rejectAbort(signal.reason)
  signal.addEventListener('abort', onAbort, { once: true })

  const task = Promise.resolve().then(() => {
    signal.throwIfAborted()
    return run()
  })
  void task.catch(() => undefined)

  try {
    const value = await Promise.race([task, aborted])
    signal.throwIfAborted()
    return value
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

export function mergeAbortSignals(controller: AbortSignal, signals: (AbortSignal | undefined)[], timeout?: number): AbortSignal {
  validateTransportTimeout(timeout)
  const hasTimeout = typeof timeout === 'number'
  const merged: AbortSignal[] = [controller]

  for (const signal of signals) {
    if (signal) {
      merged.push(signal)
    }
  }

  if (!hasTimeout && merged.length === 1) {
    return controller
  }

  let timeoutTimer: ReturnType<typeof setTimeout> | undefined
  if (hasTimeout) {
    const timeoutController = new AbortController()
    timeoutTimer = setTimeout(() => {
      timeoutController.abort(ERR_TIMEOUT)
    }, timeout)
    merged.push(timeoutController.signal)
  }

  const combined = AbortSignal.any(merged)
  if (timeoutTimer !== undefined) {
    const timer = timeoutTimer
    const clear = () => {
      clearTimeout(timer)
    }
    if (combined.aborted) {
      clear()
    } else {
      combined.addEventListener('abort', clear, { once: true })
    }
  }

  return combined
}

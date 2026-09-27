import type { PreflightFault } from '../error'
import { createNetworkFault, createPreflightFault, ERR_ABORTED, ERR_TIMEOUT } from '../error'

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

/** The cancellation cause for an already-aborted signal, or `undefined` while it is still live. */
export function resolveAbortCause(signal: AbortSignal): Error | undefined {
  if (!signal.aborted) {
    return undefined
  }

  return resolveAbortedCause(signal)
}

/** `ERR_TIMEOUT` or `ERR_ABORTED`, chosen from the signal's abort reason. */
export function resolveAbortedCause(signal: AbortSignal): Error {
  const reason = signal.reason
  const timedOut = reason === ERR_TIMEOUT || (reason instanceof Error && reason.name === 'TimeoutError')

  return timedOut ? ERR_TIMEOUT : ERR_ABORTED
}

/** `REQ_OPTIONS_INVALID` for execute options that pass both `abort` and `timeout`. */
export function createAbortTimeoutConflictFault(): PreflightFault {
  return createPreflightFault('REQ_OPTIONS_INVALID', new Error(ABORT_TIMEOUT_CONFLICT_MESSAGE))
}

/** The cancellation fault for an already-aborted signal, or `undefined` while it is still live. */
export function resolveAbortFault(signal: AbortSignal): PreflightFault | undefined {
  if (!signal.aborted) {
    return undefined
  }

  return resolveAbortedFault(signal)
}

/** `NET_ABORTED` or `NET_TIMEOUT`, chosen from the signal's abort reason. */
export function resolveAbortedFault(signal: AbortSignal): PreflightFault {
  return createNetworkFault(resolveAbortedCause(signal))
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

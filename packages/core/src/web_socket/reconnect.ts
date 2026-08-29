import type { ClientWebSocketOptions } from '../client/config'
import type { SocketLifecycleOutcome } from './web_socket'

export type NormalizedReconnectConfig = {
  attempts: number
  delayMs: number
  factor: number
  hasShouldReconnect: boolean
  jitter: number
  maxDelayMs: number
  shouldReconnect: (outcome: SocketLifecycleOutcome, attempt: number) => boolean
}

export function normalizeReconnectConfig(config: ClientWebSocketOptions['reconnect'] | undefined): NormalizedReconnectConfig | undefined {
  if (!config) {
    return undefined
  }

  const reconnectPredicate = config.shouldReconnect
  const attempts = config.attempts ?? 3
  if (!Number.isSafeInteger(attempts) || attempts < 0) {
    throw new RangeError('WebSocket reconnect attempts must be a non-negative safe integer')
  }
  if (attempts === 0) {
    return undefined
  }

  const delayMs = config.delayMs ?? 1_000
  assertFiniteRange('delayMs', delayMs, 0)
  const factor = config.factor ?? 2
  assertFiniteRange('factor', factor, Number.MIN_VALUE)
  const jitter = config.jitter ?? 0
  assertFiniteRange('jitter', jitter, 0, 1)
  const maxDelayMs = config.maxDelayMs ?? 30_000
  assertFiniteRange('maxDelayMs', maxDelayMs, 0)

  return {
    attempts,
    delayMs,
    factor,
    hasShouldReconnect: typeof reconnectPredicate === 'function',
    jitter,
    maxDelayMs,
    shouldReconnect: (outcome, attempt) => {
      if (typeof reconnectPredicate === 'function') {
        return Boolean(
          reconnectPredicate({
            attempt,
            cause: outcome.cause,
            code: outcome.closeInfo.code,
            reason: outcome.closeInfo.reason,
            wasClean: outcome.closeInfo.wasClean,
          }),
        )
      }

      return true
    },
  }
}

export function shouldReconnect(config: NormalizedReconnectConfig | undefined, outcome: SocketLifecycleOutcome, attempt: number): boolean {
  if (!config) {
    return false
  }

  if (outcome.opened === false && config.attempts <= 0) {
    return false
  }

  return config.shouldReconnect(outcome, attempt)
}

function assertFiniteRange(field: string, value: number, minimum: number, maximum = Number.POSITIVE_INFINITY): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`WebSocket reconnect ${field} is out of range`)
  }
}

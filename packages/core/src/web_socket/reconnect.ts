import type { WebSocketReconnectOptions } from '../client/config'
import type { SocketLifecycleOutcome } from './web_socket'

export type NormalizedReconnectConfig = {
  attempts: number
  delayMs: number
  factor: number
  jitter: number
  maxDelayMs: number
  shouldReconnect: (outcome: SocketLifecycleOutcome, attempt: number) => boolean
}

export function normalizeReconnectConfig(config: WebSocketReconnectOptions | undefined): NormalizedReconnectConfig | undefined {
  if (!config) {
    return undefined
  }

  const attempts = config.attempts ?? 3
  if (attempts <= 0) {
    return undefined
  }

  return {
    attempts,
    delayMs: config.delayMs ?? 1_000,
    factor: config.factor ?? 2,
    jitter: config.jitter ?? 0,
    maxDelayMs: config.maxDelayMs ?? 30_000,
    shouldReconnect: (outcome, attempt) => {
      if (typeof config.shouldReconnect === 'function') {
        return Boolean(
          config.shouldReconnect({
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

export function computeReconnectDelay(config: NormalizedReconnectConfig, attempt: number): number {
  const exponential = Math.min(config.delayMs * config.factor ** Math.max(0, attempt - 1), config.maxDelayMs)
  if (config.jitter <= 0) {
    return exponential
  }

  const random = 1 + (Math.random() * 2 - 1) * config.jitter
  return Math.max(0, Math.round(exponential * random))
}

export async function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    const onAbort = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
      reject(signal.reason)
    }

    if (signal.aborted) {
      onAbort()
      return
    }

    signal.addEventListener('abort', onAbort, { once: true })
  })
}

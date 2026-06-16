import type { NonNullableValue, FnReturn } from '../internal/utility_types'
import { describe, expect, test, vi } from 'vitest'
import { computeReconnectDelay, normalizeReconnectConfig, shouldReconnect, wait } from './reconnect'
import type { SocketLifecycleOutcome } from './web_socket'

describe('reconnect config', () => {
  test('normalizeReconnectConfig returns undefined for undefined input', () => {
    expect(normalizeReconnectConfig(undefined)).toBeUndefined()
  })

  test('normalizeReconnectConfig returns undefined when attempts <= 0', () => {
    expect(normalizeReconnectConfig({ attempts: 0 })).toBeUndefined()
    expect(normalizeReconnectConfig({ attempts: -1 })).toBeUndefined()
  })

  test('normalizeReconnectConfig uses defaults', () => {
    const config = normalizeReconnectConfig({})
    expect(config).toMatchObject({
      attempts: 3,
      delayMs: 1000,
      factor: 2,
      jitter: 0,
      maxDelayMs: 30000,
    })
    expect(config?.shouldReconnect({} as SocketLifecycleOutcome, 1)).toBe(true)
  })

  test('normalizeReconnectConfig accepts custom values', () => {
    const config = normalizeReconnectConfig({
      attempts: 5,
      delayMs: 500,
      factor: 3,
      jitter: 0.5,
      maxDelayMs: 10000,
    })
    expect(config).toMatchObject({
      attempts: 5,
      delayMs: 500,
      factor: 3,
      jitter: 0.5,
      maxDelayMs: 10000,
    })
  })

  test('normalizeReconnectConfig custom shouldReconnect receives correct context', () => {
    const customFn = vi.fn().mockReturnValue(false)
    const config = normalizeReconnectConfig({ shouldReconnect: customFn })
    const outcome: SocketLifecycleOutcome = {
      closeInfo: { code: 1006, reason: 'abnormal', wasClean: false },
      cause: new Error('test'),
      opened: true,
    }
    const result = config?.shouldReconnect(outcome, 2)
    expect(result).toBe(false)
    expect(customFn).toHaveBeenCalledWith({
      attempt: 2,
      cause: outcome.cause,
      code: 1006,
      reason: 'abnormal',
      wasClean: false,
    })
  })
})

describe('shouldReconnect', () => {
  test('returns false when config is undefined', () => {
    expect(shouldReconnect(undefined, {} as SocketLifecycleOutcome, 1)).toBe(false)
  })

  test('returns false when not opened and attempts <= 0', () => {
    const config = normalizeReconnectConfig({ attempts: 0 })
    expect(shouldReconnect(config, { opened: false } as SocketLifecycleOutcome, 1)).toBe(false)
  })

  test('returns true with default config', () => {
    const config = normalizeReconnectConfig({})
    expect(shouldReconnect(config, { opened: true } as SocketLifecycleOutcome, 1)).toBe(true)
  })

  test('returns false when opened is false and attempts is zero on normalized config', () => {
    const config: NonNullableValue<FnReturn<typeof normalizeReconnectConfig>> = {
      attempts: 0,
      delayMs: 1000,
      factor: 2,
      jitter: 0,
      maxDelayMs: 30000,
      shouldReconnect: () => true,
    }
    expect(shouldReconnect(config, { opened: false } as SocketLifecycleOutcome, 1)).toBe(false)
  })
})

describe('computeReconnectDelay', () => {
  test('computes exponential delay without jitter', () => {
    const config = normalizeReconnectConfig({ delayMs: 1000, factor: 2 })
    expect(config).toBeDefined()
    if (!config) {
      throw new Error('Expected reconnect config')
    }
    expect(computeReconnectDelay(config, 1)).toBe(1000)
    expect(computeReconnectDelay(config, 2)).toBe(2000)
    expect(computeReconnectDelay(config, 3)).toBe(4000)
  })

  test('caps delay at maxDelayMs', () => {
    const config = normalizeReconnectConfig({ delayMs: 1000, factor: 2, maxDelayMs: 3000 })
    expect(config).toBeDefined()
    if (!config) {
      throw new Error('Expected reconnect config')
    }
    expect(computeReconnectDelay(config, 3)).toBe(3000)
    expect(computeReconnectDelay(config, 10)).toBe(3000)
  })

  test('applies jitter within range', () => {
    const config = normalizeReconnectConfig({ delayMs: 1000, factor: 2, jitter: 0.5 })
    expect(config).toBeDefined()
    if (!config) {
      throw new Error('Expected reconnect config')
    }
    for (let i = 0; i < 20; i++) {
      const delay = computeReconnectDelay(config, 1)
      expect(delay).toBeGreaterThanOrEqual(500)
      expect(delay).toBeLessThanOrEqual(1500)
    }
  })

  test('returns 0 for attempt 0', () => {
    const config = normalizeReconnectConfig({ delayMs: 1000 })
    expect(config).toBeDefined()
    if (!config) {
      throw new Error('Expected reconnect config')
    }
    expect(computeReconnectDelay(config, 0)).toBe(1000)
  })
})

describe('wait', () => {
  test('resolves after delay', async () => {
    const start = Date.now()
    await wait(50, new AbortController().signal)
    expect(Date.now() - start).toBeGreaterThanOrEqual(40)
  })

  test('resolves immediately when ms <= 0', async () => {
    await expect(wait(0, new AbortController().signal)).resolves.toBeUndefined()
    await expect(wait(-1, new AbortController().signal)).resolves.toBeUndefined()
  })

  test('rejects when signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort('already aborted')
    await expect(wait(1000, controller.signal)).rejects.toBe('already aborted')
  })

  test('rejects when signal aborts during wait', async () => {
    const controller = new AbortController()
    setTimeout(() => controller.abort('aborted'), 10)
    await expect(wait(1000, controller.signal)).rejects.toBe('aborted')
  })
})

import { afterEach, describe, expect, test, vi } from 'vitest'
import { mergeAbortSignals } from './abort'

describe('abort helpers', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test('should merge abort signals and preserve single controller signal', () => {
    const controller = new AbortController()
    expect(mergeAbortSignals(controller.signal, [])).toBe(controller.signal)

    const another = new AbortController()
    const merged = mergeAbortSignals(controller.signal, [another.signal])
    another.abort('stop')

    expect(merged.aborted).toBe(true)
    expect(merged.reason).toBe('stop')
  })

  test('should merge timeout into abort signals', async () => {
    const controller = new AbortController()
    const merged = mergeAbortSignals(controller.signal, [], 20)

    await new Promise(resolve => {
      setTimeout(resolve, 40)
    })

    expect(merged.aborted).toBe(true)
    expect(merged.reason).toBeInstanceOf(Error)
  })
})

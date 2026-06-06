import { afterEach, describe, expect, test, vi } from 'vitest'
import { createAbortTimeoutConflictError, hasAbortTimeoutConflict, mergeAbortSignals } from './abort'

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

  test('should detect abort and timeout field conflict', () => {
    const signal = new AbortController().signal

    expect(hasAbortTimeoutConflict(undefined)).toBe(false)
    expect(hasAbortTimeoutConflict({})).toBe(false)
    expect(hasAbortTimeoutConflict({ abort: signal })).toBe(false)
    expect(hasAbortTimeoutConflict({ timeout: 100 })).toBe(false)
    expect(hasAbortTimeoutConflict({ abort: signal, timeout: 100 })).toBe(true)
    expect(hasAbortTimeoutConflict({ abort: signal, timeout: 0 })).toBe(true)
    expect(hasAbortTimeoutConflict({ abort: signal, timeout: undefined })).toBe(false)
  })

  test('should create a request validation definition error for abort timeout conflict', () => {
    const error = createAbortTimeoutConflictError()

    expect(error.kind).toBe('definition')
    expect(error.code).toBe('REQUEST_VALIDATION_FAILED')
    expect(error.message).toBe('with.abort and with.timeout cannot be used together')
    expect(error.cause).toBeInstanceOf(Error)
  })
})

import { afterEach, describe, expect, test, vi } from 'vitest'
import { makeHttpContext, makeHttpContextToken } from './context'
import type { HttpRequest } from './http'
import type { InterceptorFn } from './interceptor'
import { applyRequestInterceptors, mergeAbortSignals, mergeHttpContexts } from './shared'

describe('shared context helpers', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test('should merge http contexts with secondary context taking precedence', () => {
    const tokenA = makeHttpContextToken(() => 'a-default')
    const tokenB = makeHttpContextToken(() => 'b-default')

    const primary = makeHttpContext().set(tokenA, 'from-primary').set(tokenB, 'from-primary')
    const secondary = makeHttpContext().set(tokenB, 'from-secondary')

    const merged = mergeHttpContexts(primary, secondary)
    expect(merged.get(tokenA)).toBe('from-primary')
    expect(merged.get(tokenB)).toBe('from-secondary')
  })

  test('should apply request interceptors and return the final request', async () => {
    const callOrder: string[] = []
    const baseRequest: HttpRequest = {
      endpoint: '/users',
      headers: new Headers(),
      method: 'GET',
    }
    const interceptors: InterceptorFn[] = [
      async (request, next) => {
        callOrder.push('first')
        const headers = new Headers(request.headers)
        headers.set('x-first', '1')
        return next({
          ...request,
          headers,
        })
      },
      async (request, next) => {
        callOrder.push('second')
        const headers = new Headers(request.headers)
        headers.set('x-second', '2')
        return next({
          ...request,
          headers,
        })
      },
    ]

    const finalRequest = await applyRequestInterceptors(baseRequest, interceptors)

    expect(callOrder).toEqual(['first', 'second'])
    expect(finalRequest.headers?.get('x-first')).toBe('1')
    expect(finalRequest.headers?.get('x-second')).toBe('2')
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

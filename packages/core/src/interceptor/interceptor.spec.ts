import { describe, expect, it } from 'vitest'
import type { HttpRequest } from '../http'
import { makeFakeHandler } from '../http/transport/test_handler'
import { createHttpInterceptor, type InterceptorFn, makeInterceptorChain } from '../interceptor/interceptor'

describe('interceptor', () => {
  it('should work with InterceptorFn chain', async () => {
    const result: number[] = []
    const fun1: InterceptorFn = (req, next) => {
      result.push(1)
      return next(req).then(r => {
        result.push(1.1)
        return r
      })
    }

    const fun2: InterceptorFn = (req, next) => {
      result.push(2)
      return next(req).then(r => {
        result.push(2.1)
        return r
      })
    }

    const fun3: InterceptorFn = (req, next) => {
      result.push(3)
      return next(req).then(r => {
        result.push(3.1)
        return r
      })
    }

    const handler = makeFakeHandler({
      response: {
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        body: 'Hello World',
      },
    })
    const chain = makeInterceptorChain([fun1, fun2, fun3])
    const req: HttpRequest = {
      baseEndpoint: 'https://api.github.com',
      method: 'GET',
      endpoint: '/user',
    }

    await chain(req, handler)

    expect(result).toEqual([1, 2, 3, 3.1, 2.1, 1.1])
  })

  it('should create HttpInterceptor with createHttpInterceptor', () => {
    const interceptor = createHttpInterceptor((req, next) => next(req))
    expect(interceptor.kind).toBe('http')
    expect(typeof interceptor.fn).toBe('function')
  })
})

import { describe, expect, test } from 'vitest'
import type { HttpRequest } from '../http'
import { makeFakeHandler } from '../http/transport/test_handler'
import type { EventStreamHandle } from '../sse/transport/event_stream'
import { type BasicCredential, basicAuthHttpInterceptor, basicAuthSSEInterceptor } from './basic_auth'
import { makeInterceptorChain, makeSSEInterceptorChain } from './interceptor'

describe('Basic Auth Interceptor', () => {
  const credential: BasicCredential = {
    username: 'user',
    password: '123',
  }

  test('basicAuthHttpInterceptor should set Authorization header', async () => {
    const hq: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/v1/user',
      method: 'GET',
    }
    const interceptor = basicAuthHttpInterceptor(() => credential)
    const chain = makeInterceptorChain([interceptor.fn])
    const handler = makeFakeHandler({
      response: {
        status: 200,
        statusText: 'OK',
      },
      onRequestBefore: req => {
        const authorization = req.headers?.get('Authorization')
        expect(req.headers).toBeInstanceOf(Headers)
        expect(authorization).toEqual(`Basic ${btoa(`${credential.username}:${credential.password}`)}`)
      },
    })

    await chain(hq, handler)
  })

  test('basicAuthHttpInterceptor should accept custom encode', async () => {
    const hq: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/v1/user',
      method: 'GET',
    }
    const interceptor = basicAuthHttpInterceptor(() => credential, {
      encode: data => btoa(`${data.username}:${data.password}`),
    })
    const chain = makeInterceptorChain([interceptor.fn])
    const handler = makeFakeHandler({
      response: {
        status: 200,
        statusText: 'OK',
      },
      onRequestBefore: req => {
        const authorization = req.headers?.get('Authorization')
        expect(authorization).toEqual(`Basic ${btoa(`${credential.username}:${credential.password}`)}`)
      },
    })

    await chain(hq, handler)
  })

  test('basicAuthSSEInterceptor should set Authorization header', async () => {
    const hq: HttpRequest = {
      baseEndpoint: 'https://example.com',
      endpoint: '/v1/events',
      method: 'GET',
    }
    const interceptor = basicAuthSSEInterceptor(() => credential)
    const chain = makeSSEInterceptorChain([interceptor.fn])

    let capturedRequest: HttpRequest | undefined
    const fakeSseHandler = async (req: HttpRequest) => {
      capturedRequest = req
      return {} as EventStreamHandle<unknown>
    }

    await chain(hq, fakeSseHandler)

    expect(capturedRequest).toBeDefined()
    expect(capturedRequest!.headers?.get('Authorization')).toEqual(`Basic ${btoa(`${credential.username}:${credential.password}`)}`)
  })

  test('should throw error if btoa is not supported', () => {
    const _btoa = globalThis.btoa
    // @ts-ignore
    globalThis.btoa = undefined

    expect(() => basicAuthHttpInterceptor(() => credential)).toThrowError()
    expect(() => basicAuthSSEInterceptor(() => credential)).toThrowError()

    globalThis.btoa = _btoa
  })

  test('basicAuthHttpInterceptor should return kind http', () => {
    const interceptor = basicAuthHttpInterceptor(() => credential)
    expect(interceptor.kind).toBe('http')
  })

  test('basicAuthSSEInterceptor should return kind sse', () => {
    const interceptor = basicAuthSSEInterceptor(() => credential)
    expect(interceptor.kind).toBe('sse')
  })
})

import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'
import { createClient, resetGlobalClient, setGlobalClient, withEndpoint, withInterceptors } from '../client'
import { createHttpInterceptor } from '../interceptor'
import { makeResponse } from '../internal/http_response'
import { struct } from '../struct'
import { defineRequest } from './index'

describe('request http response type declarations', () => {
  beforeEach(() => {
    setGlobalClient(createClient(withEndpoint(inject('testServerHost'))))
  })

  afterEach(() => {
    resetGlobalClient()
  })

  test('should support explicit responseType declarations', async () => {
    const client = createClient(
      withEndpoint('https://example.com'),
      withInterceptors(
        createHttpInterceptor(async ({ endpoint }) => {
          switch (endpoint) {
            case '/json-text':
              return makeResponse({
                body: { id: 1 },
                headers: new Headers([['content-type', 'application/json']]),
                status: 200,
              })
            case '/plain-text':
              return makeResponse({
                body: 'zen-kit',
                headers: new Headers([['content-type', 'text/plain']]),
                status: 200,
              })
            default:
              return makeResponse({
                body: null,
                status: 404,
              })
          }
        }),
      ),
    )

    const useJsonResponse = defineRequest({
      method: 'GET',
      output: {
        200: struct.object({
          id: struct.number(),
        }),
      },
      responseType: 'json',
      path: '/json-text',
    })

    const useTextResponse = defineRequest({
      method: 'GET',
      output: {
        200: struct.string(),
      },
      responseType: 'text',
      path: '/plain-text',
    })

    const [[jsonError, jsonResult], [textError, textResult]] = await Promise.all([
      useJsonResponse().with({ client }),
      useTextResponse().with({ client }),
    ])

    expect(jsonError).toBeNull()
    expect(jsonResult).toEqual({ id: 1 })
    expect(textError).toBeNull()
    expect(textResult).toBe('zen-kit')
  })
})

import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'
import { createClient, resetGlobalClient, setGlobalClient, withEndpoint, withInterceptors } from '../client'
import { createHttpInterceptor } from '../interceptor/interceptor'
import { makeHttpContext, makeHttpContextToken } from '../internal/context'
import { makeResponse } from '../internal/http_response'
import { defineRequest } from './index'

describe('request http runtime context', () => {
  beforeEach(() => {
    setGlobalClient(createClient(withEndpoint(inject('testServerHost'))))
  })

  afterEach(() => {
    resetGlobalClient()
  })

  test('should use context and interceptors for request-scoped transaction data', async () => {
    const transactionToken = makeHttpContextToken(() => '')
    let seenHeader: string | null = null

    const client = createClient(
      withEndpoint('https://example.com'),
      withInterceptors(
        createHttpInterceptor(async (request, next) => {
          const nextHeaders = new Headers(request.headers)
          const transactionId = request.context?.get(transactionToken)
          if (transactionId) {
            nextHeaders.set('x-transaction-id', transactionId)
          }

          return next({
            ...request,
            headers: nextHeaders,
          })
        }),
        createHttpInterceptor(async (request) => {
          seenHeader = request.headers?.get('x-transaction-id') ?? null
          return makeResponse({
            body: null,
            status: 200,
          })
        }),
      ),
    )

    const useTxRequest = defineRequest({
      method: 'GET',
      path: '/transaction',
    })

    const context = makeHttpContext()
    context.set(transactionToken, 'tx-001')

    const [error] = (await client.execute(useTxRequest(undefined, { context }))) as any

    expect(error).toBeNull()
    expect(seenHeader).toBe('tx-001')
  })
})

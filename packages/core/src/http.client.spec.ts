import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'
import { createClient, restGlobalClient, setGlobalClient } from './client'
import { defineRequest } from './index'
import { ERR_NOT_FOUND_GLOBAL_CLIENT, makeResponse } from './response'
import { schema } from './schema'

describe('request http runtime with client config', () => {
  beforeEach(() => {
    setGlobalClient(
      createClient({
        endpoint: inject('testServerHost'),
      }),
    )
  })

  afterEach(() => {
    restGlobalClient()
  })

  test('should support queryParamsSerializer from client config', async () => {
    let capturedRequestUrl = ''

    setGlobalClient(
      createClient({
        endpoint: 'https://example.com',
        http: {
          handler: async request => {
            capturedRequestUrl = `${request.endpoint}?${request.queryString ?? ''}`
            return makeResponse({
              body: null,
              status: 200,
            })
          },
        },
        queryParamsSerializer(params) {
          return Array.from(params.entries())
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, value]) => `${key.toUpperCase()}=${value}`)
            .join('&')
        },
      }),
    )

    const useSerializedQuery = defineRequest({
      build: request => {
        request.queryParams({
          b: '2',
          a: '1',
        })
      },
      method: 'GET',
      path: '/query',
    }).use

    const [error] = await useSerializedQuery()

    expect(error).toBeNull()
    expect(capturedRequestUrl).toBe('/query?A=1&B=2')
  })

  test('should resolve client from config first and then from global client', async () => {
    restGlobalClient()

    const localClient = createClient({
      endpoint: 'https://example.com/api',
      http: {
        handler: async request =>
          makeResponse({
            body: {
              endpoint: request.baseEndpoint,
            },
            status: 200,
          }),
      },
    })

    const useGetInfo = defineRequest({
      method: 'GET',
      output: {
        200: schema.object({
          endpoint: schema.string(),
        }),
      },
      path: '/info',
    }).use

    const [localError, localResult] = await useGetInfo()({
      client: localClient,
    })

    expect(localError).toBeNull()
    expect(localResult).toEqual({
      endpoint: 'https://example.com/api',
    })

    const [missingClientError] = await useGetInfo()

    expect(missingClientError?.kind).toBe('transport')
    expect(missingClientError?.message).toContain(ERR_NOT_FOUND_GLOBAL_CLIENT.message)
  })
})

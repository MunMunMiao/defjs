import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'

import { createClient, resetGlobalClient, setGlobalClient, withEndpoint } from '../client'
import { struct } from '../struct'
import { defineRequest } from './index'

describe('http browser runtime', () => {
  beforeEach(() => {
    setGlobalClient(createClient(withEndpoint(inject('testServerHost'))))
  })

  afterEach(() => {
    resetGlobalClient()
  })

  test('should resolve request tuples in real browsers', async () => {
    const useGetAccount = defineRequest({
      method: 'GET',
      output: {
        200: struct.object({
          id: struct.number(),
        }),
      },
      path: '/json',
    })

    const [error, result, response] = await useGetAccount()

    expect(error).toBeNull()
    expect(result).toEqual({ id: 1 })
    expect(response?.ok).toBe(true)
  })

  test('should support fetch download progress hooks in real browsers', async () => {
    const downloadLoaded: number[] = []

    const useCreateAccount = defineRequest({
      build: (request, input) => {
        request.setArrayBuffer(input.body)
      },
      input: struct.request({ body: struct.arrayBuffer() }),
      method: 'POST',
      path: '/',
    })

    const ref = useCreateAccount().with({
      onDownloadProgress(event) {
        downloadLoaded.push(event.loaded)
      },
    })

    const [error, result, response] = await ref

    expect(error).toBeNull()
    expect(result).toBeUndefined()
    expect(response?.ok).toBe(true)
    expect(downloadLoaded.length).toBeGreaterThan(0)
  })

  test('should preserve fetch timeout semantics in request runtime', async () => {
    const useDelay = defineRequest({
      build: (request, input) => {
        request.setQueryParams({ ms: input.query.ms })
      },
      input: struct.request({ query: struct.object({ ms: struct.number() }) }),
      method: 'GET',
      path: '/delay',
    })

    const [error, result, response] = await useDelay().with({
      timeout: 100,
    })

    expect(result).toBeUndefined()
    expect(response).toBeUndefined()
    expect(error?.kind).toBe('transport')

    if (!error || error.kind !== 'transport') {
      throw new Error('Expected transport error')
    }

    expect(error.code).toBe('TIMEOUT')
  })
})

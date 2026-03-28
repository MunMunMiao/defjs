import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'

import { createClient, restGlobalClient, setGlobalClient } from './client'
import { defineRequest } from './index'
import { schema } from './schema'
import { xhrHandler } from './transport'

describe('http browser runtime', () => {
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

  test('should resolve request tuples in real browsers', async () => {
    const useGetAccount = defineRequest({
      method: 'GET',
      output: {
        200: schema.object({
          id: schema.number(),
        }),
      },
      path: '/json',
    }).use

    const [error, result, response] = await useGetAccount()

    expect(error).toBeNull()
    expect(result).toEqual({ id: 1 })
    expect(response?.ok).toBe(true)
  })

  test('should support xhr progress hooks in real browsers', async () => {
    setGlobalClient(
      createClient({
        endpoint: inject('testServerHost'),
        http: {
          handler: xhrHandler,
        },
      }),
    )

    const uploadLoaded: number[] = []
    const downloadLoaded: number[] = []

    const useCreateAccount = defineRequest({
      build: request => {
        request.body(new ArrayBuffer(16 * 1024))
      },
      method: 'POST',
      path: '/',
    }).use

    const ref = useCreateAccount()({
      onDownloadProgress(event) {
        downloadLoaded.push(event.loaded)
      },
      onUploadProgress(event) {
        uploadLoaded.push(event.loaded)
      },
    })

    const [error, result, response] = await ref

    expect(error).toBeNull()
    expect(result).toBeUndefined()
    expect(response?.ok).toBe(true)
    expect(uploadLoaded.length).toBeGreaterThan(0)
    expect(downloadLoaded.length).toBeGreaterThan(0)
  })

  test('should preserve xhr timeout semantics in request runtime', async () => {
    setGlobalClient(
      createClient({
        endpoint: inject('testServerHost'),
        http: {
          handler: xhrHandler,
        },
      }),
    )

    const useDelay = defineRequest({
      build: request => {
        request.queryParams({
          ms: 1000,
        })
      },
      method: 'GET',
      path: '/delay',
    }).use

    const [error, result, response] = await useDelay()({
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

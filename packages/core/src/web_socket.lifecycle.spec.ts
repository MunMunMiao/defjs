import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'
import { createClient, restGlobalClient, setGlobalClient } from './client'
import { defineWebSocket } from './index'
import { schema } from './schema'

describe('web socket runtime lifecycle', () => {
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

  test('should allow closing websocket refs before startup', async () => {
    const ref = defineWebSocket({
      incoming: {
        ready: schema.object({
          ok: schema.boolean(),
        }),
      },
      path: '/ws/echo',
    }).use()

    ref.close()

    const [error, socket, connection] = await ref

    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(error?.kind).toBe('transport')

    if (!error || error.kind !== 'transport') {
      throw new Error('Expected transport error')
    }

    expect(error.code).toBe('ABORTED')
    expect(ref.status).toBe('aborted')
  })

  test('should skip unexpected websocket messages after startup', async () => {
    const ref = defineWebSocket({
      incoming: {
        message: schema.object({
          count: schema.number(),
        }),
      },
      path: '/ws/invalid',
    }).use()

    const [error, socket] = await ref

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket session')
    }

    const messages: unknown[] = []
    for await (const message of socket.receive) {
      messages.push(message)
    }

    expect(messages).toEqual([])
    await expect(socket.closed).resolves.toMatchObject({ code: 1000 })
    expect(ref.status).toBe('closed')
    expect(ref.error).toBeUndefined()
  })

  test('should use request-level beforeConnect hook and client query serializer', async () => {
    setGlobalClient(
      createClient({
        endpoint: inject('testServerHost'),
        queryParamsSerializer(params) {
          return `token=${params.get('token') ?? 'missing'}&from=serializer`
        },
      }),
    )

    const useBeforeConnectSocket = defineWebSocket({
      build: request => {
        request.queryParams({
          token: 'secret-0',
        })
      },
      incoming: {
        connected: schema.object({
          token: schema.string(),
        }),
      },
      path: '/ws/before-connect',
    }).use

    let callCount = 0

    const [error, socket, connection] = await useBeforeConnectSocket()({
      beforeConnect: async () => {
        callCount += 1
      },
    })

    expect(error).toBeNull()
    expect(callCount).toBe(1)
    expect(connection?.url).toContain('token=secret-0')
    expect(connection?.url).toContain('from=serializer')

    if (!socket) {
      throw new Error('Expected socket session')
    }

    const iterator = socket.receive[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { token: 'secret-0', type: 'connected' },
    })

    await expect(socket.closed).resolves.toMatchObject({ code: 1000 })
  })
})

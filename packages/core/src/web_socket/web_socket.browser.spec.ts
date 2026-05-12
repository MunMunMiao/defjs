import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'

import { createClient, restGlobalClient, setGlobalClient } from '../client'
import { schema } from '../schema'
import { defineWebSocket } from './index'

describe('web socket browser runtime', () => {
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

  test('should connect and exchange typed messages in real browsers', async () => {
    const useEchoSocket = defineWebSocket({
      incoming: {
        message: schema.object({
          text: schema.string(),
        }),
        ready: schema.object({
          ok: schema.boolean(),
        }),
      },
      outgoing: {
        message: schema.object({
          text: schema.string(),
        }),
      },
      path: '/ws/echo',
    })

    const [error, socket, connection] = await useEchoSocket().with({
      protocols: ['json'],
    })

    expect(error).toBeNull()
    expect(connection?.protocol).toBe('json')
    if (!socket) {
      throw new Error('Expected socket session')
    }

    const iterator = socket.receive[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { ok: true, type: 'ready' },
    })

    socket.send({
      text: 'hello-browser',
      type: 'message',
    })

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { text: 'hello-browser', type: 'message' },
    })

    socket.close(1000, 'done')
    await expect(socket.closed).resolves.toMatchObject({ code: 1000 })
  })

  test('should reconnect in real browsers', async () => {
    const [error, socket] = await defineWebSocket({
      build: (request, input) => {
        request.queryParams({
          key: input.key,
        })
      },
      incoming: {
        reconnected: schema.object({
          attempt: schema.number(),
        }),
      },
      input: schema.object({
        key: schema.string(),
      }),
      path: '/ws/reconnect',
    })({ key: 'browser-reconnect' }).with({
      reconnect: { attempts: 1, delayMs: 0 },
    })

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket session')
    }

    const iterator = socket.receive[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { attempt: 2, type: 'reconnected' },
    })
  })
})

import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'

import { createClient, withEndpoint, type Client } from '../client'
import { struct } from '../struct'
import { defineWebSocket } from './index'

describe('web socket browser runtime', () => {
  let client: Client

  beforeEach(() => {
    client = createClient(withEndpoint(inject('testServerHost')))
  })

  afterEach(() => {
    // cleanup only
  })

  async function run(command: unknown, options?: unknown): Promise<any> {
    return client.execute(command as never, options)
  }

  test('should connect and exchange typed messages in real browsers', async () => {
    const useEchoSocket = defineWebSocket({
      incoming: {
        message: struct.object({
          text: struct.string(),
        }),
        ready: struct.object({
          ok: struct.boolean(),
        }),
      },
      outgoing: {
        message: struct.object({
          text: struct.string(),
        }),
      },
      path: '/ws/echo',
      protocols: ['json'],
    })

    const [error, socket, connection] = await run(useEchoSocket())

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

  test('should receive binary websocket frames as typed messages', async () => {
    const useBinarySocket = defineWebSocket({
      incoming: {
        message: struct.object({
          text: struct.string(),
        }),
      },
      path: '/ws/binary',
      protocols: ['json'],
    })

    const [error, socket] = await run(useBinarySocket())

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket session')
    }

    const iterator = socket.receive[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { text: 'hello-binary', type: 'message' },
    })
  })

  test('should reconnect in real browsers', async () => {
    const command = defineWebSocket({
      build: (request: any, input: any) => {
        request.setQueryParams({
          key: input.query.key,
        })
      },
      incoming: {
        reconnected: struct.object({
          attempt: struct.number(),
        }),
      },
      input: struct.request({
        query: struct.object({
          key: struct.string(),
        }),
      }),
      path: '/ws/reconnect',
    })({ query: { key: 'browser-reconnect' } })
    const [error, socket] = await run(command, {
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

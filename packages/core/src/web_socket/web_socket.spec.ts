import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'
import { createClient, restGlobalClient, setGlobalClient } from '../client'
import { schema } from '../schema'
import { defineWebSocket } from './index'

describe('web socket runtime', () => {
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

  test('should resolve thenable websocket refs and receive typed messages', async () => {
    const useChatSocket = defineWebSocket({
      build: (request, input) => {
        request.queryParams({
          roomId: input.roomId,
        })
      },
      incoming: {
        joined: schema.object({
          roomId: schema.string(),
          userId: schema.number(),
        }),
        message: schema.object({
          text: schema.string(),
          userId: schema.number(),
        }),
      },
      input: schema.object({
        roomId: schema.string(),
      }),
      outgoing: {
        message: schema.object({
          text: schema.string(),
        }),
      },
      path: '/ws/basic',
      protocols: ['json'],
    })

    const [error, socket, connection] = await useChatSocket({ roomId: 'room-1' })

    expect(error).toBeNull()
    expect(connection?.protocol).toBe('json')
    expect(connection?.url).toContain('/ws/basic?roomId=room-1')

    if (!socket) {
      throw new Error('Expected socket session')
    }

    const messages: unknown[] = []
    for await (const message of socket.receive) {
      messages.push(message)
    }

    expect(messages).toEqual([
      { roomId: 'room-1', type: 'joined', userId: 1 },
      { text: 'welcome:room-1', type: 'message', userId: 1 },
    ])
    await expect(socket.closed).resolves.toMatchObject({ code: 1000 })
  })

  test('should validate outgoing messages and echo typed responses', async () => {
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
      text: 'hello',
      type: 'message',
    })

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { text: 'hello', type: 'message' },
    })

    socket.close(1000, 'done')
    await expect(socket.closed).resolves.toMatchObject({ code: 1000 })
  })
})

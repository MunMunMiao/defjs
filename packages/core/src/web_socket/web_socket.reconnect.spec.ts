import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'
import { createClient, restGlobalClient, setGlobalClient } from '../client'
import { schema } from '../schema'
import { defineWebSocket } from './index'

describe('web socket runtime reconnect', () => {
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

  test('should reconnect and flush queued messages', async () => {
    const useReconnectSocket = defineWebSocket({
      build: (request, input) => {
        request.queryParams({
          key: input.key,
        })
      },
      incoming: {
        message: schema.object({
          text: schema.string(),
        }),
        reconnected: schema.object({
          attempt: schema.number(),
        }),
      },
      input: schema.object({
        key: schema.string(),
      }),
      outgoing: {
        message: schema.object({
          text: schema.string(),
        }),
      },
      path: '/ws/reconnect',
    })

    const ref = useReconnectSocket({ key: 'queue-case' }).with({
      queue: { maxSize: 2 },
      reconnect: { attempts: 1, delayMs: 0 },
    })

    const states: string[] = []
    let session:
      | {
          send(message: { text: string; type: 'message' }): void
        }
      | undefined

    ref.onStateChange(state => {
      states.push(state)
      if (state === 'reconnecting' && session) {
        session.send({
          text: 'after-reconnect',
          type: 'message',
        })
      }
    })

    const [error, socket] = await ref

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket session')
    }

    session = socket

    const iterator = socket.receive[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { attempt: 2, type: 'reconnected' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { text: 'after-reconnect', type: 'message' },
    })

    socket.close(1000, 'done')
    await expect(socket.closed).resolves.toMatchObject({ code: 1000 })
    expect(states).toContain('reconnecting')
  })

  test('should pass actual reconnect attempt count to shouldReconnect', async () => {
    const retryClient = createClient({
      endpoint: 'http://127.0.0.1:1',
    })

    const useRetrySocket = defineWebSocket({
      incoming: {},
      path: '/ws/reconnect',
    })

    const attempts: number[] = []

    const [error, socket, connection] = await useRetrySocket().with({
      client: retryClient,
      reconnect: {
        attempts: 2,
        delayMs: 0,
        shouldReconnect(context) {
          attempts.push(context.attempt)
          return context.attempt < 2
        },
      },
    })

    expect(socket).toBeUndefined()
    expect(connection?.url).toBe('ws://127.0.0.1:1/ws/reconnect')
    expect(error?.kind).toBe('transport')
    expect(attempts).toEqual([1, 2])
  })
})

import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'
import { createClient, withEndpoint, type Client } from '../client'
import { struct } from '../struct'
import { defineWebSocket } from './index'

describe('web socket runtime reconnect', () => {
  let client: Client

  beforeEach(() => {
    client = createClient(withEndpoint(inject('testServerHost')))
  })

  afterEach(() => {
    // cleanup only
  })

  async function run(command: unknown, options?: { signal?: AbortSignal }): Promise<any> {
    return client.execute(command as never, options)
  }

  test('should reconnect and flush queued messages', async () => {
    const useReconnectSocket = defineWebSocket({
      build: (request: any, input: any) => {
        request.setQueryParams({
          key: input.query.key,
        })
      },
      incoming: {
        message: struct.object({
          text: struct.string(),
        }),
        reconnected: struct.object({
          attempt: struct.number(),
        }),
      },
      input: struct.request({
        query: struct.object({
          key: struct.string(),
        }),
      }),
      outgoing: {
        message: struct.object({
          text: struct.string(),
        }),
      },
      path: '/ws/reconnect',
    })

    const command = useReconnectSocket({ query: { key: 'queue-case' } })
    const commandWithConfig = {
      ...command,
      config: {
        queue: { maxSize: 2 },
        reconnect: { attempts: 1, delayMs: 0 },
      },
    }

    const states: string[] = []
    let session:
      | {
          send(message: { text: string; type: 'message' }): void
        }
      | undefined

    const executePromise = run(commandWithConfig)

    const [error, socket] = await executePromise

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket session')
    }

    session = socket

    socket.onStateChange((state: string) => {
      states.push(state)
      if (state === 'reconnecting' && session) {
        session.send({
          text: 'after-reconnect',
          type: 'message',
        })
      }
    })

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
    const retryClient = createClient(withEndpoint('http://127.0.0.1:1'))

    const useRetrySocket = defineWebSocket({
      incoming: {},
      path: '/ws/reconnect',
    })

    const attempts: number[] = []

    const command = useRetrySocket()
    const commandWithConfig = {
      ...command,
      config: {
        reconnect: {
          attempts: 2,
          delayMs: 0,
          shouldReconnect(context: { attempt: number }) {
            attempts.push(context.attempt)
            return context.attempt < 2
          },
        },
      },
    }

    const [error, socket, connection] = (await retryClient.execute(commandWithConfig)) as any

    expect(socket).toBeUndefined()
    expect(connection?.url).toBe('ws://127.0.0.1:1/ws/reconnect')
    expect(error?.kind).toBe('transport')
    expect(attempts).toEqual([1, 2])
  })

  test('should not consider manual session close for reconnect', async () => {
    const useSocket = defineWebSocket({
      incoming: {
        ready: struct.object({
          ok: struct.boolean(),
        }),
      },
      path: '/ws/echo',
    })

    const attempts: number[] = []
    const command = useSocket()
    const commandWithConfig = {
      ...command,
      config: {
        reconnect: {
          attempts: 1,
          delayMs: 0,
          shouldReconnect(context: { attempt: number }) {
            attempts.push(context.attempt)
            return false
          },
        },
      },
    }
    const [error, socket] = await run(commandWithConfig)

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket')
    }

    socket.close(1000, 'manual')

    await expect(socket.closed).resolves.toMatchObject({ code: 1000, reason: 'manual' })
    expect(attempts).toEqual([])
  })
})

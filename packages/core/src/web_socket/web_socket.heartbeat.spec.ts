import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'
import { createClient, withEndpoint, type Client } from '../client'
import { struct } from '../struct'
import { defineWebSocket, type SocketAwaitResult } from './index'

describe('web socket runtime heartbeat', () => {
  let client: Client

  beforeEach(() => {
    client = createClient(withEndpoint(inject('testServerHost')))
  })

  afterEach(() => {
    // cleanup only
  })

  async function run(command: unknown, options?: unknown): Promise<SocketAwaitResult<unknown, unknown>> {
    return client.execute(command as never, options) as Promise<SocketAwaitResult<unknown, unknown>>
  }

  test('should send heartbeat messages automatically when heartbeat.message is provided', async () => {
    const useHeartbeatSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
      incoming: {
        pong: struct.object({
          ok: struct.boolean(),
        }),
      },
      outgoing: {
        ping: struct.object({
          at: struct.number(),
        }),
      },
      path: '/ws/heartbeat',
    })

    let runtimeError: unknown

    const controller = new AbortController()
    const command = useHeartbeatSocket()

    const executePromise = run(command, {
      signal: controller.signal,
      heartbeat: {
        intervalMs: 10,
        isAck(message: { type: string }) {
          return message.type === 'pong'
        },
        message: () => ({
          at: Date.now(),
          type: 'ping',
        }),
        timeoutMs: 100,
      },
    })

    const [error, socket] = await executePromise

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket session')
    }

    socket.onRuntimeError((err: unknown) => {
      runtimeError = err
    })

    await expect(socket.closed).resolves.toMatchObject({ code: 1000, reason: 'heartbeat-ok' })
    expect(runtimeError).toBeUndefined()
  })
})

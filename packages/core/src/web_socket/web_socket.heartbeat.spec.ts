import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'
import { createClient, withEndpoint, type Client } from '../client'
import { struct } from '../struct'
import { defineWebSocket } from './index'

describe('web socket runtime heartbeat', () => {
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

  test('should send heartbeat messages automatically when heartbeat.message is provided', async () => {
    const useHeartbeatSocket = defineWebSocket({
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
    const commandWithConfig = {
      ...command,
      config: {
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
      },
    }

    const executePromise = run(commandWithConfig, { signal: controller.signal })

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

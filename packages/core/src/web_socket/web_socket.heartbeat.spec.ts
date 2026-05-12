import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'
import { createClient, resetGlobalClient, setGlobalClient } from '../client'
import { schema } from '../schema'
import { defineWebSocket } from './index'

describe('web socket runtime heartbeat', () => {
  beforeEach(() => {
    setGlobalClient(
      createClient({
        endpoint: inject('testServerHost'),
      }),
    )
  })

  afterEach(() => {
    resetGlobalClient()
  })

  test('should send heartbeat messages automatically when heartbeat.message is provided', async () => {
    const useHeartbeatSocket = defineWebSocket({
      incoming: {
        pong: schema.object({
          ok: schema.boolean(),
        }),
      },
      outgoing: {
        ping: schema.object({
          at: schema.number(),
        }),
      },
      path: '/ws/heartbeat',
    })

    let runtimeError: unknown

    const ref = useHeartbeatSocket().with({
      heartbeat: {
        intervalMs: 10,
        isAck(message) {
          return message.type === 'pong'
        },
        message: () => ({
          at: Date.now(),
          type: 'ping',
        }),
        timeoutMs: 100,
      },
    })

    ref.onRuntimeError(error => {
      runtimeError = error
    })

    const [error, socket] = await ref

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket session')
    }

    await expect(socket.closed).resolves.toMatchObject({ code: 1000, reason: 'heartbeat-ok' })
    expect(runtimeError).toBeUndefined()
  })
})

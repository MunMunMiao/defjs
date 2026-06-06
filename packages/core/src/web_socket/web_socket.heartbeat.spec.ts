import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'
import { createClient, resetGlobalClient, setGlobalClient, withEndpoint } from '../client'
import { struct } from '../struct'
import { defineWebSocket } from './index'

describe('web socket runtime heartbeat', () => {
  beforeEach(() => {
    setGlobalClient(createClient(withEndpoint(inject('testServerHost'))))
  })

  afterEach(() => {
    resetGlobalClient()
  })

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

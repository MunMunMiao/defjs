import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'
import { createClient, resetGlobalClient, setGlobalClient, withEndpoint, withInterceptors } from '../client'
import { ERR_ABORTED } from '../error'
import { createWebSocketInterceptor } from '../interceptor'
import { struct } from '../struct'
import { defineWebSocket } from './index'

describe('web socket runtime', () => {
  beforeEach(() => {
    setGlobalClient(
      createClient(withEndpoint(inject('testServerHost'))),
    )
  })

  afterEach(() => {
    resetGlobalClient()
  })

  test('should return transport error with invalid client', async () => {
    const useSocket = defineWebSocket({
      incoming: {},
      path: '/ws/basic',
    })

    const [error, socket, connection] = await useSocket().with({
      client: {} as never,
    })

    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(error?.kind).toBe('transport')
  })

  test('should reject with.abort and with.timeout before starting websocket transport', async () => {
    const controller = new AbortController()
    let beforeConnectCalls = 0
    const useSocket = defineWebSocket({
      incoming: {},
      path: '/ws/basic',
    })

    const ref = useSocket().with({
      abort: controller.signal,
      beforeConnect: () => {
        beforeConnectCalls += 1
      },
      timeout: 1,
    } as never)
    const [error, socket, connection] = await ref

    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(error?.kind).toBe('definition')
    expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
    expect(error?.message).toBe('with.abort and with.timeout cannot be used together')
    expect(ref.status).toBe('error')
    expect(beforeConnectCalls).toBe(0)
  })

  test('should prefer websocket cancellation config conflict over an already aborted signal', async () => {
    const controller = new AbortController()
    controller.abort(ERR_ABORTED)
    const useSocket = defineWebSocket({
      incoming: {},
      path: '/ws/basic',
    })

    const ref = useSocket().with({ abort: controller.signal, timeout: 1 } as never)
    const [error, socket, connection] = await ref

    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(error?.kind).toBe('definition')
    expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
    expect(error?.message).toBe('with.abort and with.timeout cannot be used together')
    expect(ref.status).toBe('error')
  })

  test('should resolve thenable websocket refs and receive typed messages', async () => {
    const useChatSocket = defineWebSocket({
      build: (request, input) => {
        request.setQueryParams({
          roomId: input.query.roomId,
        })
      },
      incoming: {
        joined: struct.object({
          roomId: struct.string(),
          userId: struct.number(),
        }),
        message: struct.object({
          text: struct.string(),
          userId: struct.number(),
        }),
      },
      input: struct.request({
        query: struct.object({
          roomId: struct.string(),
        }),
      }),
      outgoing: {
        message: struct.object({
          text: struct.string(),
        }),
      },
      path: '/ws/basic',
      protocols: ['json'],
    })

    const [error, socket, connection] = await useChatSocket({ query: { roomId: 'room-1' } })

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

  test('should support heartbeat with timeout', async () => {
    const useHeartbeatSocket = defineWebSocket({
      incoming: {
        pong: struct.object({
          ok: struct.boolean(),
        }),
      },
      outgoing: {
        ping: struct.object({}),
      },
      path: '/ws/heartbeat-silent',
    })

    const [error, socket] = await useHeartbeatSocket().with({
      heartbeat: {
        intervalMs: 10,
        message: () => ({ type: 'ping' }),
        timeoutMs: 5,
      },
    })

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket')
    }

    let runtimeError: unknown
    socket.onRuntimeError(err => {
      runtimeError = err
    })

    await new Promise(resolve => setTimeout(resolve, 50))

    expect(runtimeError).toBeDefined()
    await expect(socket.closed).resolves.toBeDefined()
  })

  test('should mark heartbeat ack when server responds with pong', async () => {
    const useHeartbeatSocket = defineWebSocket({
      incoming: {
        pong: struct.object({
          ok: struct.boolean(),
        }),
      },
      outgoing: {
        ping: struct.object({}),
      },
      path: '/ws/heartbeat',
    })

    const [error, socket] = await useHeartbeatSocket().with({
      heartbeat: {
        intervalMs: 10,
        isAck: message => message.type === 'pong',
        message: () => ({ type: 'ping' }),
        timeoutMs: 30,
      },
    })

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket')
    }

    let runtimeError: unknown
    socket.onRuntimeError(err => {
      runtimeError = err
    })

    await expect(socket.closed).resolves.toMatchObject({ code: 1000, reason: 'heartbeat-ok' })
    expect(runtimeError).toBeUndefined()
  })

  test('should skip invalid incoming websocket payloads without runtime error', async () => {
    const useSocket = defineWebSocket({
      incoming: {
        message: struct.object({
          text: struct.string(),
        }),
      },
      path: '/ws/invalid',
    })

    const [error, socket] = await useSocket()

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket')
    }

    const events: unknown[] = []
    for await (const event of socket.receive) {
      events.push(event)
    }

    expect(events).toEqual([])
    await expect(socket.closed).resolves.toMatchObject({ code: 1000, reason: 'done' })
  })

  test('should emit runtime error when incoming message schema validation fails', async () => {
    const useSocket = defineWebSocket({
      incoming: {
        message: struct.object({
          text: struct.string(),
        }),
      },
      path: '/ws/error-before-close',
    })

    const [error, socket] = await useSocket()

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket')
    }

    let runtimeError: unknown
    socket.onRuntimeError(err => {
      runtimeError = err
    })

    await expect(socket.closed).resolves.toMatchObject({ code: 1000, reason: 'done' })
    expect(runtimeError).toBeDefined()
  })

  test('should skip undeclared incoming message types', async () => {
    const useSocket = defineWebSocket({
      incoming: {
        message: struct.object({
          text: struct.string(),
        }),
      },
      path: '/ws/unknown-message',
    })

    const [error, socket] = await useSocket()

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket')
    }

    const events: unknown[] = []
    for await (const event of socket.receive) {
      events.push(event)
    }

    expect(events).toEqual([])
    await expect(socket.closed).resolves.toMatchObject({ code: 1000, reason: 'done' })
  })

  test('should expose ref state transitions and allow unsubscribing listeners', async () => {
    const useSocket = defineWebSocket({
      incoming: {
        joined: struct.object({
          roomId: struct.string(),
          userId: struct.number(),
        }),
      },
      path: '/ws/close-immediately',
    })

    const ref = useSocket()
    const states: string[] = []
    const refStates: string[] = []
    const unsubscribeRefState = ref.onStateChange(state => {
      refStates.push(state)
    })
    const unsubscribeRefError = ref.onRuntimeError(() => {
      throw new Error('Unexpected ref runtime error')
    })

    expect(ref.status).toBe('idle')
    void ref.then(() => undefined)
    expect(ref.status).toBe('connecting')

    const [error, socket, connection] = await ref

    expect(error).toBeNull()
    expect(connection?.url).toContain('/ws/close-immediately')
    expect(ref.connection?.url).toContain('/ws/close-immediately')
    expect(ref.error).toBeUndefined()
    expect(ref.status).toBe('open')

    unsubscribeRefState()
    unsubscribeRefError()

    if (!socket) {
      throw new Error('Expected socket')
    }

    const unsubscribeSocketState = socket.onStateChange(state => {
      states.push(state)
    })
    const unsubscribeSocketError = socket.onRuntimeError(() => {
      throw new Error('Unexpected socket runtime error')
    })

    expect(socket.connection.url).toContain('/ws/close-immediately')
    expect(socket.state).toBe('open')

    unsubscribeSocketState()
    unsubscribeSocketError()

    await expect(socket.closed).resolves.toMatchObject({ code: 1000, reason: 'bye' })
    expect(ref.status).toBe('closed')
    expect(refStates).toContain('connecting')
    expect(refStates).toContain('open')
    expect(states).toEqual([])
  })

  test('should support ref.close after startup and ignore socket.close after cleanup', async () => {
    const useSocket = defineWebSocket({
      incoming: {
        ready: struct.object({
          ok: struct.boolean(),
        }),
      },
      path: '/ws/echo',
    })

    const ref = useSocket()
    const [error, socket] = await ref

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket')
    }

    ref.close(1000, 'manual')
    await expect(socket.closed).resolves.toBeDefined()
    expect(ref.status).toBe('closed')

    socket.close(1000, 'after-cleanup')
  })

  test('should close ref before startup and surface aborted transport error', async () => {
    const useSocket = defineWebSocket({
      incoming: {},
      path: '/ws/basic',
    })

    const ref = useSocket()
    ref.close(1000, 'manual-stop')

    const [error, socket, connection] = await ref

    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(error?.kind).toBe('transport')
    expect(error?.code).toBe('ABORTED')
    expect(ref.status).toBe('aborted')
  })

  test('should return definition error when input validation fails', async () => {
    const useSocket = defineWebSocket({
      incoming: {},
      input: struct.object({
        id: struct.number(),
      }),
      path: '/ws/basic',
    })

    const [error, socket, connection] = await useSocket({ id: 'bad' } as never)

    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(error?.kind).toBe('definition')
    expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
  })

  test('should return definition error when build throws', async () => {
    const useSocket = defineWebSocket({
      build: () => {
        throw new Error('build failed')
      },
      incoming: {},
      path: '/ws/basic',
    })

    const [error, socket, connection] = await useSocket()

    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(error?.kind).toBe('definition')
    expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
  })

  test('should return definition error when websocket url creation fails', async () => {
    const useSocket = defineWebSocket({
      incoming: {},
      path: '/ws/basic',
    })

    const [error, socket, connection] = await useSocket().with({
      client: createClient(withEndpoint('not-a-valid-url')),
    })

    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(error?.kind).toBe('definition')
    expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
  })

  test('should return transport error when beforeConnect throws', async () => {
    const useSocket = defineWebSocket({
      incoming: {},
      path: '/ws/basic',
    })

    const [error, socket, connection] = await useSocket().with({
      beforeConnect: async () => {
        throw new Error('beforeConnect failed')
      },
    })

    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(error?.kind).toBe('transport')
  })

  test('should support reconnect, queued sends, and abort during reconnect delay', async () => {
    const useSocket = defineWebSocket({
      build(request, input) {
        request.setQueryParams({ key: input.query.key })
      },
      input: struct.request({ query: struct.object({ key: struct.string() }) }),
      incoming: {
        message: struct.object({
          text: struct.string(),
        }),
        reconnected: struct.object({
          attempt: struct.number(),
        }),
      },
      outgoing: {
        message: struct.object({
          text: struct.string(),
        }),
      },
      path: '/ws/reconnect',
    })

    const controller = new AbortController()
    const [error, socket] = await useSocket().with({
      abort: controller.signal,
      reconnect: { attempts: 2, delayMs: 20 },
    })

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket')
    }

    const iterator = socket.receive[Symbol.asyncIterator]()
    await new Promise(resolve => setTimeout(resolve, 40))
    socket.send({ type: 'message', text: 'queued-before-reconnect' })

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { attempt: 2, type: 'reconnected' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { text: 'queued-before-reconnect', type: 'message' },
    })

    controller.abort('stop reconnect loop')
    await expect(socket.closed).resolves.toBeDefined()
    expect(socket.state).toBe('error')
  })

  test('should abort during reconnect delay with aborted state', async () => {
    const useSocket = defineWebSocket({
      build(request, input) {
        request.setQueryParams({ key: input.query.key })
      },
      input: struct.request({ query: struct.object({ key: struct.string() }) }),
      incoming: {
        reconnected: struct.object({
          attempt: struct.number(),
        }),
      },
      path: '/ws/reconnect',
    })

    const controller = new AbortController()
    const [error, socket] = await useSocket().with({
      abort: controller.signal,
      reconnect: { attempts: 2, delayMs: 100 },
    })

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket')
    }

    await new Promise(resolve => setTimeout(resolve, 40))
    controller.abort(ERR_ABORTED)

    await expect(socket.closed).resolves.toBeDefined()
    expect(socket.state).toBe('aborted')
  })

  test('should reconnect immediately when delay is zero', async () => {
    const useSocket = defineWebSocket({
      build(request, input) {
        request.setQueryParams({ key: input.query.key })
      },
      input: struct.request({ query: struct.object({ key: struct.string() }) }),
      incoming: {
        reconnected: struct.object({
          attempt: struct.number(),
        }),
      },
      path: '/ws/reconnect',
    })

    const [error, socket] = await useSocket().with({
      reconnect: { attempts: 1, delayMs: 0 },
    })

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket')
    }

    const iterator = socket.receive[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { attempt: 2, type: 'reconnected' },
    })

    socket.close(1000, 'done')
    await expect(socket.closed).resolves.toMatchObject({ code: 1000 })
  })

  test('should allow websocket interceptors to short-circuit startup', async () => {
    const useSocket = defineWebSocket({
      incoming: {},
      path: '/ws/basic',
    })

    const client = createClient(
      withEndpoint(inject('testServerHost')),
      withInterceptors(
        createWebSocketInterceptor(async () => {
          throw new Error('blocked by interceptor')
        }),
      ),
    )

    const [error, socket, connection] = await useSocket().with({ client })

    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(error).toBeInstanceOf(Error)
  })

  test('should connect with request changes made by websocket interceptors', async () => {
    const useSocket = defineWebSocket({
      incoming: {
        joined: struct.object({
          roomId: struct.string(),
          userId: struct.number(),
        }),
      },
      path: '/ws/basic',
    })

    const client = createClient(
      withEndpoint(inject('testServerHost')),
      withInterceptors(
        createWebSocketInterceptor(async (request, next) =>
          next({
            ...request,
            queryString: 'roomId=from-interceptor',
          }),
        ),
      ),
    )

    const [error, socket, connection] = await useSocket().with({ client })

    expect(error).toBeNull()
    expect(connection?.url).toContain('roomId=from-interceptor')
    if (!socket) {
      throw new Error('Expected socket session')
    }

    const iterator = socket.receive[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { roomId: 'from-interceptor', type: 'joined', userId: 1 },
    })

    socket.close(1000, 'done')
    await expect(socket.closed).resolves.toMatchObject({ code: 1000 })
  })
})

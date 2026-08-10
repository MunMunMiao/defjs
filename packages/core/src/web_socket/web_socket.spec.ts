import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'
import { createClient, getClientConfig, withEndpoint, withInterceptors, type Client } from '../client'
import { ERR_ABORTED } from '../error'
import { createWebSocketInterceptor, type WebSocketSessionLike } from '../interceptor'
import { struct } from '../struct'
import { defineWebSocket, type SocketAwaitResult } from './index'

describe('web socket runtime', () => {
  let client: Client

  beforeEach(() => {
    client = createClient(withEndpoint(inject('testServerHost')))
  })

  afterEach(() => {
    // cleanup only
  })

  async function run(command: unknown, options?: unknown): Promise<SocketAwaitResult<unknown, unknown>> {
    return client.execute(command as never, options as never) as Promise<SocketAwaitResult<unknown, unknown>>
  }

  test('should return transport error with invalid client', async () => {
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
      incoming: {},
      path: '/ws/basic',
    })

    const client = createClient(withEndpoint('http://localhost'))
    getClientConfig(client).webSocket.handle = class {
      constructor() {
        throw new Error('invalid client')
      }
    } as unknown as typeof WebSocket

    const [error, socket, connection] = await client.execute(useSocket())

    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(error?.kind).toBe('transport')
  })

  test('should reject with abort and timeout before starting websocket transport', async () => {
    const controller = new AbortController()
    let beforeConnectCalls = 0
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
      incoming: {},
      path: '/ws/basic',
    })

    const command = useSocket()
    const [error, socket, connection] = await run(command, {
      abort: controller.signal,
      beforeConnect: () => {
        beforeConnectCalls += 1
      },
      timeout: 1,
    })

    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(error?.kind).toBe('definition')
    expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
    expect(error?.message).toBe('with.abort and with.timeout cannot be used together')
    expect(beforeConnectCalls).toBe(0)
  })

  test('should prefer websocket cancellation config conflict over an already aborted signal', async () => {
    const controller = new AbortController()
    controller.abort(ERR_ABORTED)
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
      incoming: {},
      path: '/ws/basic',
    })

    const command = useSocket()
    const [error, socket, connection] = await run(command, {
      abort: controller.signal,
      timeout: 1,
    })

    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(error?.kind).toBe('definition')
    expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
    expect(error?.message).toBe('with.abort and with.timeout cannot be used together')
  })

  test.each([
    { options: { heartbeat: { intervalMs: Number.POSITIVE_INFINITY } }, source: 'heartbeat' },
    { options: { reconnect: { attempts: Number.POSITIVE_INFINITY, delayMs: 0 } }, source: 'reconnect' },
  ])('should reject invalid $source timer config before constructing a socket', async ({ options }) => {
    let constructorCalls = 0
    getClientConfig(client).webSocket.handle = class {
      constructor() {
        constructorCalls += 1
      }
    } as unknown as typeof WebSocket
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/basic' })

    const [error, socket, connection] = await run(useSocket(), options)

    expect(error?.kind).toBe('definition')
    expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(constructorCalls).toBe(0)
  })

  test('should resolve execute and receive typed messages', async () => {
    const useChatSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
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

    const [error, socket, connection] = await run(useChatSocket({ query: { roomId: 'room-1' } }))

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
      maxIncomingQueueSize: 16,
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
      maxIncomingQueueSize: 16,
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

    const command = useHeartbeatSocket()
    const [error, socket] = await run(command, {
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
    socket.onRuntimeError((err: unknown) => {
      runtimeError = err
    })

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(runtimeError).toBeDefined()
    await expect(socket.closed).resolves.toBeDefined()
  })

  test('should mark heartbeat ack when server responds with pong', async () => {
    const useHeartbeatSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
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

    const command = useHeartbeatSocket()
    const [error, socket] = await run(command, {
      heartbeat: {
        intervalMs: 10,
        isAck: (message: { type: string }) => message.type === 'pong',
        message: () => ({ type: 'ping' }),
        timeoutMs: 1_000,
      },
    })

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket')
    }

    let runtimeError: unknown
    socket.onRuntimeError((err: unknown) => {
      runtimeError = err
    })

    const iterator = socket.receive[Symbol.asyncIterator]()
    await expect(socket.closed).resolves.toMatchObject({ code: 1000, reason: 'heartbeat-ok' })
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined })
    expect(runtimeError).toBeUndefined()
  })

  test('should report malformed JSON, drop the frame, and keep the session alive', async () => {
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
      incoming: {
        message: struct.object({
          text: struct.string(),
        }),
      },
      path: '/ws/invalid',
    })

    const [error, socket] = await run(useSocket())

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket')
    }

    let runtimeError: unknown
    socket.onRuntimeError((error) => {
      runtimeError = error
    })
    const events: unknown[] = []
    for await (const event of socket.receive) {
      events.push(event)
    }

    expect(events).toEqual([])
    expect(runtimeError).toBeInstanceOf(SyntaxError)
    await expect(socket.closed).resolves.toMatchObject({ code: 1000, reason: 'done' })
  })

  test('should emit runtime error when incoming message struct validation fails', async () => {
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
      incoming: {
        message: struct.object({
          text: struct.string(),
        }),
      },
      path: '/ws/error-before-close',
    })

    const [error, socket] = await run(useSocket())

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket')
    }

    let runtimeError: unknown
    socket.onRuntimeError((err: unknown) => {
      runtimeError = err
    })

    await expect(socket.closed).resolves.toMatchObject({ code: 1000, reason: 'done' })
    expect(runtimeError).toBeDefined()
  })

  test('should skip undeclared incoming message types', async () => {
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
      incoming: {
        message: struct.object({
          text: struct.string(),
        }),
      },
      path: '/ws/unknown-message',
    })

    const [error, socket] = await run(useSocket())

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

  test('should expose session state transitions and allow unsubscribing listeners', async () => {
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
      incoming: {
        ready: struct.object({
          ok: struct.boolean(),
        }),
      },
      path: '/ws/echo',
    })

    const [error, socket, connection] = await run(useSocket())

    expect(error).toBeNull()
    expect(connection?.url).toContain('/ws/echo')

    if (!socket) {
      throw new Error('Expected socket')
    }

    const states: string[] = []
    const unsubscribeSocketState = socket.onStateChange((state) => {
      states.push(state)
    })
    const unsubscribeSocketError = socket.onRuntimeError(() => {
      throw new Error('Unexpected socket runtime error')
    })

    expect(socket.connection.url).toContain('/ws/echo')
    expect(socket.state).toBe('open')

    unsubscribeSocketState()
    unsubscribeSocketError()

    socket.close(1000, 'done')
    await expect(socket.closed).resolves.toMatchObject({ code: 1000, reason: 'done' })
    expect(states).toEqual([])
  })

  test('should support abort after startup and ignore socket.close after cleanup', async () => {
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
      incoming: {
        ready: struct.object({
          ok: struct.boolean(),
        }),
      },
      path: '/ws/echo',
    })

    const controller = new AbortController()
    const [error, socket] = await run(useSocket(), { signal: controller.signal })

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket')
    }

    controller.abort('manual')
    await expect(socket.closed).resolves.toBeDefined()

    socket.close(1000, 'after-cleanup')
    socket.close(1000, 'after-cleanup-2')
  })

  test('should abort before startup and surface aborted transport error', async () => {
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
      incoming: {},
      path: '/ws/basic',
    })

    const controller = new AbortController()
    const executePromise = run(useSocket(), { signal: controller.signal })
    controller.abort(ERR_ABORTED)

    const [error, socket, connection] = await executePromise

    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(error?.kind).toBe('transport')
    expect(error?.code).toBe('ABORTED')
  })

  test('should return definition error when input validation fails', async () => {
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
      incoming: {},
      input: struct.object({
        id: struct.number(),
      }),
      path: '/ws/basic',
    })

    const [error, socket, connection] = await run(useSocket({ id: 'bad' } as never))

    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(error?.kind).toBe('definition')
    expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
  })

  test('should return definition error when build throws', async () => {
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
      build: () => {
        throw new Error('build failed')
      },
      incoming: {},
      input: struct.object({}),
      path: '/ws/basic',
    })

    const [error, socket, connection] = await run(useSocket({}))

    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(error?.kind).toBe('definition')
    expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
  })

  test('should return definition error when websocket url creation fails', async () => {
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
      incoming: {},
      path: '/ws/basic',
    })

    const badClient = createClient(withEndpoint('not-a-valid-url'))
    const [error, socket, connection] = await badClient.execute(useSocket())

    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(error?.kind).toBe('definition')
    expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
  })

  test('should return transport error when beforeConnect throws', async () => {
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
      incoming: {},
      path: '/ws/basic',
    })

    const command = useSocket()
    const [error, socket, connection] = await run(command, {
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
      maxIncomingQueueSize: 16,
      maxOutgoingQueueSize: 1,
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
    const testKey = `reconnect-queue-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const command = useSocket({ query: { key: testKey } })
    const [error, socket] = await run(command, {
      abort: controller.signal,
      reconnect: { attempts: 2, delayMs: 20 },
    })

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket')
    }

    const iterator = socket.receive[Symbol.asyncIterator]()
    await new Promise<void>((resolve) => {
      if (socket.state === 'reconnecting') {
        resolve()
        return
      }
      const unsubscribe = socket.onStateChange((state) => {
        if (state === 'reconnecting') {
          unsubscribe()
          resolve()
        }
      })
    })
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
    expect(socket.state).toBe('aborted')
  }, 5000)

  test('should abort during reconnect delay with aborted state', async () => {
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
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
    const command = useSocket({ query: { key: 'abort-during-delay' } })
    const [error, socket] = await run(command, {
      abort: controller.signal,
      reconnect: { attempts: 2, delayMs: 100 },
    })

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket')
    }

    await new Promise((resolve) => setTimeout(resolve, 60))
    controller.abort(ERR_ABORTED)

    await expect(socket.closed).resolves.toBeDefined()
    expect(socket.state).toBe('aborted')
  })

  test('should reconnect immediately when delay is zero', async () => {
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
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

    const command = useSocket({ query: { key: 'immediate-case' } })
    const [error, socket] = await run(command, {
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
      maxIncomingQueueSize: 16,
      incoming: {},
      path: '/ws/basic',
    })

    const clientWithInterceptor = createClient(
      withEndpoint(inject('testServerHost')),
      withInterceptors(
        createWebSocketInterceptor(async () => {
          throw new Error('blocked by interceptor')
        }),
      ),
    )

    const [error, socket, connection] = await clientWithInterceptor.execute(useSocket())

    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(error).toBeInstanceOf(Error)
  })

  test('should settle every session created before an interceptor chain fails', async () => {
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 16, incoming: {}, path: '/ws/echo' })
    const interceptorFailure = new Error('outer interceptor failed')
    const createdSessions: WebSocketSessionLike[] = []
    const clientWithInterceptor = createClient(
      withEndpoint(inject('testServerHost')),
      withInterceptors(
        createWebSocketInterceptor(async (request, next) => {
          createdSessions.push(await next(request))
          throw interceptorFailure
        }),
      ),
    )

    const [error, socket] = await clientWithInterceptor.execute(useSocket())

    expect(error).toBe(interceptorFailure)
    expect(socket).toBeUndefined()
    expect(createdSessions).toHaveLength(1)
    const terminal = await Promise.race([
      Promise.all(createdSessions.map((session) => session.closed)),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 50)),
    ])
    expect(terminal).not.toBe(false)
    expect(createdSessions.every((session) => ['aborted', 'closed', 'error'].includes(session.state))).toBe(true)
  })

  test('should reject a second websocket interceptor next call and settle the first session', async () => {
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 16, incoming: {}, path: '/ws/echo' })
    let firstSession: WebSocketSessionLike | undefined
    const clientWithInterceptor = createClient(
      withEndpoint(inject('testServerHost')),
      withInterceptors(
        createWebSocketInterceptor(async (request, next) => {
          firstSession = await next(request)
          return next(request)
        }),
      ),
    )

    const [error, socket] = await clientWithInterceptor.execute(useSocket())

    if (socket) {
      socket.close(1000, 'unexpected second session')
      await socket.closed
    }

    expect(error).toMatchObject({ message: 'WebSocket interceptor next() may only be called once' })
    expect(socket).toBeUndefined()
    expect(firstSession).toBeDefined()
    const terminal = await Promise.race([firstSession?.closed, new Promise<false>((resolve) => setTimeout(() => resolve(false), 50))])
    expect(terminal).not.toBe(false)
  })

  test('should close a created session discarded by a successful interceptor', async () => {
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 16, incoming: {}, path: '/ws/echo' })
    let discardedSession: WebSocketSessionLike | undefined
    const shortCircuitSession: WebSocketSessionLike = {
      bufferedAmount: 0,
      close() {},
      closed: Promise.resolve({ kind: 'closed' }),
      connection: { generation: 99 },
      onRuntimeError: () => () => {},
      onStateChange: () => () => {},
      receive: {
        async *[Symbol.asyncIterator]() {},
      },
      send() {},
      state: 'closed',
    }
    const clientWithInterceptor = createClient(
      withEndpoint(inject('testServerHost')),
      withInterceptors(
        createWebSocketInterceptor(async (request, next) => {
          discardedSession = await next(request)
          return shortCircuitSession
        }),
      ),
    )

    const [error, socket] = await clientWithInterceptor.execute(useSocket())

    expect(error).toBeNull()
    expect(socket).toBe(shortCircuitSession)
    expect(discardedSession).toBeDefined()
    const terminal = await Promise.race([discardedSession?.closed, new Promise<false>((resolve) => setTimeout(() => resolve(false), 50))])
    expect(terminal).not.toBe(false)
  })

  test('should preserve a wrapper that delegates the created session closed promise', async () => {
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 16, incoming: {}, path: '/ws/echo' })
    let createdSession: WebSocketSessionLike | undefined
    const clientWithInterceptor = createClient(
      withEndpoint(inject('testServerHost')),
      withInterceptors(
        createWebSocketInterceptor(async (request, next) => {
          createdSession = await next(request)
          return new Proxy(createdSession, {})
        }),
      ),
    )

    const [error, socket] = await clientWithInterceptor.execute(useSocket())

    expect(error).toBeNull()
    expect(socket).toBeDefined()
    expect(socket).not.toBe(createdSession)
    expect(socket?.state).toBe('open')
    socket?.close(1000, 'done')
    await expect(socket?.closed).resolves.toMatchObject({ kind: 'closed' })
  })

  test('should connect with request changes made by websocket interceptors', async () => {
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
      incoming: {
        joined: struct.object({
          roomId: struct.string(),
          userId: struct.number(),
        }),
      },
      path: '/ws/basic',
    })

    const clientWithInterceptor = createClient(
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

    const [error, socket, connection] = await clientWithInterceptor.execute(useSocket())

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

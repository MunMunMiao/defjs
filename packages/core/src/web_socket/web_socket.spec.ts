import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest'
import { createClient, withEndpoint, withInterceptors, withWebSocketHandle, type Client } from '../client'
import { ERR_ABORTED } from '../error'
import { createWebSocketInterceptor, type WebSocketSessionLike } from '../interceptor'
import { struct } from '../struct'
import { isRecord } from './codec'
import { defineWebSocket, type SocketAwaitResult, type WebSocketIncomingNormalizer, type WebSocketOutgoingNormalizer } from './index'

const normalizeProviderFrame: WebSocketIncomingNormalizer = (decoded) => {
  if (!isRecord(decoded)) return undefined
  if (typeof decoded['method'] === 'string') return { data: decoded, type: `method.${decoded['method']}` }
  if (decoded['channel'] === 'heartbeat') return { data: decoded, type: 'channel.heartbeat' }
  if (typeof decoded['channel'] === 'string' && typeof decoded['type'] === 'string') {
    return { data: decoded, type: `${decoded['channel']}.${decoded['type']}` }
  }
  return undefined
}

const normalizeProviderCommand: WebSocketOutgoingNormalizer = (_type, encodedPayload) => {
  if (!isRecord(encodedPayload)) throw new TypeError('Expected encoded provider command object')
  return encodedPayload
}

async function withDeadline<T>(label: string, promise: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} exceeded 2000ms`)), 2_000)
        timeout.unref?.()
      }),
    ])
  } finally {
    clearTimeout(timeout)
  }
}

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

    const client = createClient(
      withEndpoint('http://localhost'),
      withWebSocketHandle(
        class {
          constructor() {
            throw new Error('invalid client')
          }
        } as unknown as typeof WebSocket,
      ),
    )

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
    expect(error?.message).toBe('abort and timeout cannot be used together')
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
    expect(error?.message).toBe('abort and timeout cannot be used together')
  })

  test.each([
    { options: { heartbeat: { intervalMs: Number.POSITIVE_INFINITY } }, source: 'heartbeat' },
    { options: { reconnect: { attempts: Number.POSITIVE_INFINITY, delayMs: 0 } }, source: 'reconnect' },
  ])('should reject invalid $source timer config before constructing a socket', async ({ options }) => {
    let constructorCalls = 0
    const isolated = createClient(
      withEndpoint(inject('testServerHost')),
      withWebSocketHandle(
        class {
          constructor() {
            constructorCalls += 1
          }
        } as unknown as typeof WebSocket,
      ),
    )
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/basic' })

    const [error, socket, connection] = await isolated.execute(useSocket(), options as never)

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

  test('should use await using for a real local websocket handshake, message, and close', async () => {
    const useEchoSocket = defineWebSocket({
      maxIncomingQueueSize: 2,
      incoming: {
        message: struct.object({ text: struct.string() }),
        ready: struct.object({ ok: struct.boolean() }),
      },
      outgoing: { message: struct.object({ text: struct.string() }) },
      path: '/ws/echo',
      protocols: ['json'],
    })
    const [error, session, connection] = await run(useEchoSocket())

    expect(error).toBeNull()
    expect(connection?.protocol).toBe('json')
    if (!session) {
      throw new Error('Expected socket session')
    }

    {
      await using socket = session
      const iterator = socket.receive[Symbol.asyncIterator]()
      await expect(iterator.next()).resolves.toEqual({ done: false, value: { ok: true, type: 'ready' } })
      socket.send({ text: 'owned', type: 'message' })
      await expect(iterator.next()).resolves.toEqual({ done: false, value: { text: 'owned', type: 'message' } })
    }

    await expect(session.closed).resolves.toMatchObject({ kind: 'closed' })
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
      [Symbol.asyncDispose]() {
        this.close()
        return this.closed.then(() => undefined)
      },
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

  test('normalizes provider envelopes for direct and queued sends', async () => {
    const useProviderSocket = defineWebSocket({
      build(request, input) {
        request.setQueryParams(input.query)
      },
      incoming: {
        'channel.heartbeat': struct.object({ channel: struct.literal('heartbeat') }),
        'method.subscribe': struct.object({
          method: struct.literal('subscribe'),
          result: struct.object({ channel: struct.string() }),
          success: struct.boolean(),
        }),
        'method.wire': struct.object({
          method: struct.literal('wire'),
          result: struct.object({
            attempt: struct.number(),
            hasType: struct.boolean(),
            keys: struct.array(struct.string()),
            method: struct.string(),
            reqId: struct.number().alias('req_id'),
          }),
          success: struct.boolean(),
        }),
        'ticker.update': struct.object({
          channel: struct.literal('ticker'),
          data: struct.array(struct.object({ last: struct.number(), symbol: struct.string() })),
          providerType: struct.literal('update').alias('type'),
        }),
      },
      input: struct.request({ query: struct.object({ key: struct.string(), mode: struct.literal('queue') }) }),
      maxIncomingQueueSize: 3,
      maxOutgoingQueueSize: 1,
      normalizeIncoming: normalizeProviderFrame,
      normalizeOutgoing: normalizeProviderCommand,
      outgoing: {
        subscribe: struct.object({
          method: struct.literal('subscribe'),
          params: struct.object({ channel: struct.string() }),
          reqId: struct.number().alias('req_id'),
        }),
      },
      path: '/ws/provider-envelopes',
    })
    const key = `provider-queue-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const [error, socket] = await withDeadline(
      'provider queue execute',
      client.execute(useProviderSocket({ query: { key, mode: 'queue' } }), {
        reconnect: { attempts: 1, delayMs: 0 },
      }),
    )

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected provider socket')
    }

    const iterator = socket.receive[Symbol.asyncIterator]()
    const queued = Promise.withResolvers<void>()
    let queuedOnce = false
    const unsubscribe = socket.onStateChange((state) => {
      if (state !== 'reconnecting' || queuedOnce) {
        return
      }
      queuedOnce = true
      try {
        socket.send({
          data: { method: 'subscribe', params: { channel: 'book' }, reqId: 2 },
          type: 'subscribe',
        })
        queued.resolve()
      } catch (cause) {
        queued.reject(cause)
      }
    })

    try {
      await expect(withDeadline('provider subscribe frame', iterator.next())).resolves.toEqual({
        done: false,
        value: { method: 'subscribe', result: { channel: 'ticker' }, success: true, type: 'method.subscribe' },
      })
      await expect(withDeadline('provider heartbeat frame', iterator.next())).resolves.toEqual({
        done: false,
        value: { channel: 'heartbeat', type: 'channel.heartbeat' },
      })
      await expect(withDeadline('provider ticker frame', iterator.next())).resolves.toEqual({
        done: false,
        value: {
          channel: 'ticker',
          data: [{ last: 1, symbol: 'BTC/USD' }],
          providerType: 'update',
          type: 'ticker.update',
        },
      })

      socket.send({
        data: { method: 'subscribe', params: { channel: 'ticker' }, reqId: 1 },
        type: 'subscribe',
      })
      await expect(withDeadline('direct provider wire reply', iterator.next())).resolves.toEqual({
        done: false,
        value: {
          method: 'wire',
          result: {
            attempt: 1,
            hasType: false,
            keys: ['method', 'params', 'req_id'],
            method: 'subscribe',
            reqId: 1,
          },
          success: true,
          type: 'method.wire',
        },
      })
      await withDeadline('queued provider send', queued.promise)
      await expect(withDeadline('reconnect provider heartbeat', iterator.next())).resolves.toEqual({
        done: false,
        value: { channel: 'heartbeat', type: 'channel.heartbeat' },
      })
      await expect(withDeadline('queued provider wire reply', iterator.next())).resolves.toEqual({
        done: false,
        value: {
          method: 'wire',
          result: {
            attempt: 2,
            hasType: false,
            keys: ['method', 'params', 'req_id'],
            method: 'subscribe',
            reqId: 2,
          },
          success: true,
          type: 'method.wire',
        },
      })
    } finally {
      unsubscribe()
      socket.close(1000, 'done')
      await withDeadline('provider queue close', socket.closed)
    }
  })

  test('throws outgoing adapter errors synchronously', async () => {
    const sentinel = new Error('provider outgoing adapter failed')
    const useProviderSocket = defineWebSocket({
      build(request, input) {
        request.setQueryParams(input.query)
      },
      incoming: {},
      input: struct.request({ query: struct.object({ key: struct.string(), mode: struct.literal('throw') }) }),
      maxIncomingQueueSize: 1,
      normalizeOutgoing() {
        throw sentinel
      },
      outgoing: { command: struct.object({ method: struct.literal('command') }) },
      path: '/ws/provider-envelopes',
    })
    const key = `provider-throw-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const [error, socket] = await withDeadline(
      'provider throw execute',
      client.execute(useProviderSocket({ query: { key, mode: 'throw' } })),
    )

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected provider socket')
    }

    try {
      let thrown: unknown
      try {
        socket.send({ data: { method: 'command' }, type: 'command' })
      } catch (cause) {
        thrown = cause
      }
      expect(thrown).toBe(sentinel)
    } finally {
      socket.close(1000, 'done')
      await withDeadline('provider throw close', socket.closed)
    }
  })

  test('normalizes heartbeat wire and consumes pong as ack', async () => {
    const useProviderSocket = defineWebSocket({
      build(request, input) {
        request.setQueryParams(input.query)
      },
      incoming: {
        'method.pong': struct.object({ method: struct.literal('pong'), reqId: struct.number().alias('req_id') }),
        'method.wire': struct.object({
          method: struct.literal('wire'),
          result: struct.object({
            attempt: struct.number(),
            hasType: struct.boolean(),
            keys: struct.array(struct.string()),
            method: struct.string(),
            reqId: struct.number().alias('req_id'),
          }),
          success: struct.boolean(),
        }),
      },
      input: struct.request({ query: struct.object({ key: struct.string(), mode: struct.literal('heartbeat') }) }),
      maxIncomingQueueSize: 64,
      normalizeIncoming(decoded) {
        if (!isRecord(decoded) || typeof decoded['method'] !== 'string') return undefined
        return { data: decoded, type: `method.${decoded['method']}` }
      },
      normalizeOutgoing: normalizeProviderCommand,
      outgoing: { ping: struct.object({ method: struct.literal('ping'), reqId: struct.number().alias('req_id') }) },
      path: '/ws/provider-envelopes',
    })
    const key = `provider-heartbeat-${Date.now()}-${Math.random().toString(36).slice(2)}`
    let ackChecks = 0
    const timeoutMs = 200
    const [error, socket] = await withDeadline(
      'provider heartbeat execute',
      client.execute(useProviderSocket({ query: { key, mode: 'heartbeat' } }), {
        heartbeat: {
          intervalMs: 20,
          isAck(message) {
            ackChecks += 1
            return message.type === 'method.pong'
          },
          message: () => ({ data: { method: 'ping', reqId: 7 }, type: 'ping' }),
          timeoutMs,
        },
      }),
    )

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected provider socket')
    }

    const runtimeErrors: unknown[] = []
    const unsubscribe = socket.onRuntimeError((runtimeError) => {
      runtimeErrors.push(runtimeError)
    })
    const iterator = socket.receive[Symbol.asyncIterator]()

    try {
      await expect(withDeadline('provider heartbeat wire reply', iterator.next())).resolves.toEqual({
        done: false,
        value: {
          method: 'wire',
          result: {
            attempt: 1,
            hasType: false,
            keys: ['method', 'req_id'],
            method: 'ping',
            reqId: 7,
          },
          success: true,
          type: 'method.wire',
        },
      })
      await expect(withDeadline('next provider heartbeat wire reply', iterator.next())).resolves.toEqual({
        done: false,
        value: {
          method: 'wire',
          result: {
            attempt: 1,
            hasType: false,
            keys: ['method', 'req_id'],
            method: 'ping',
            reqId: 7,
          },
          success: true,
          type: 'method.wire',
        },
      })
      await new Promise((resolve) => setTimeout(resolve, timeoutMs + 100))
      expect(ackChecks).toBeGreaterThan(0)
      expect(socket.state).toBe('open')
      expect(runtimeErrors).toEqual([])
    } finally {
      unsubscribe()
      socket.close(1000, 'done')
      await withDeadline('provider heartbeat close', socket.closed)
    }
  })
})

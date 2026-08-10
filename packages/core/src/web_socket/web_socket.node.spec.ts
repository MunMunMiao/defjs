import { afterEach, describe, expect, test, vi } from 'vitest'
import { createClient, withEndpoint, withInterceptors, withWebSocketHandle, withWebSocketReconnect, type Client } from '../client'
import { createDefinitionError, createHttpStatusError, createTransportError, ERR_ABORTED } from '../error'
import { createWebSocketInterceptor, type WebSocketSessionLike } from '../interceptor'
import { makeResponse } from '../internal/http_response'
import { struct } from '../struct'
import { defineWebSocket, type SocketAwaitResult } from './index'

let lastMockInstance: MockWebSocketInstance | undefined
let mockInstances: MockWebSocketInstance[] = []

interface MockWebSocketInstance {
  bufferedAmount: number
  readyState: number
  url: string
  protocol: string
  extensions: string
  binaryType: string
  close: (code?: number, reason?: string) => void
  send: (data: string) => void
  addEventListener: (type: string, fn: (event: unknown) => void) => void
  removeEventListener: (type: string, fn: (event: unknown) => void) => void
  triggerOpen: () => void
  triggerClose: (event: { code: number; reason: string; wasClean: boolean }) => void
  triggerError: () => void
  triggerMessage: (data: unknown) => void
}

function createMockWebSocketClass(
  options: {
    autoOpen?: boolean
    autoCloseDelay?: number
    closeEventDelayMs?: number
    closeErrors?: readonly unknown[]
    emitCloseEvent?: boolean
    onListenerRegistered?: (type: string) => void
    onSend?: (data: string) => void
    sendError?: Error
    throwOnConstruct?: Error
  } = {},
) {
  const {
    autoOpen = true,
    autoCloseDelay = -1,
    closeEventDelayMs = 0,
    closeErrors = [],
    emitCloseEvent = true,
    onListenerRegistered,
    onSend,
    sendError,
    throwOnConstruct,
  } = options
  let closeCall = 0

  return class MockWebSocket {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3

    bufferedAmount: number
    readyState: number
    url: string
    protocol: string
    extensions: string
    binaryType: string
    close: MockWebSocketInstance['close']
    send: MockWebSocketInstance['send']
    addEventListener: MockWebSocketInstance['addEventListener']
    removeEventListener: MockWebSocketInstance['removeEventListener']
    triggerOpen: MockWebSocketInstance['triggerOpen']
    triggerClose: MockWebSocketInstance['triggerClose']
    triggerError: MockWebSocketInstance['triggerError']
    triggerMessage: MockWebSocketInstance['triggerMessage']

    private listeners: { [key: string]: Array<(event: unknown) => void> }

    constructor(url: string, protocols?: string | string[]) {
      if (throwOnConstruct) {
        throw throwOnConstruct
      }

      this.readyState = MockWebSocket.CONNECTING
      this.bufferedAmount = 0
      this.url = url
      this.protocol = Array.isArray(protocols) ? (protocols[0] ?? '') : (protocols ?? '')
      this.extensions = ''
      this.binaryType = 'blob'
      this.listeners = {}
      this.close = vi.fn((code?: number, reason?: string) => {
        const closeError = closeErrors[closeCall]
        closeCall += 1
        if (typeof closeError !== 'undefined') {
          throw closeError
        }
        this.readyState = MockWebSocket.CLOSING
        if (!emitCloseEvent) {
          return
        }
        setTimeout(() => {
          this.readyState = MockWebSocket.CLOSED
          this.listeners['close']?.forEach((fn) => {
            fn({ code: code ?? 1000, reason: reason ?? '', wasClean: true })
          })
        }, closeEventDelayMs)
      })
      this.send = vi.fn((data: string) => {
        onSend?.(data)
        if (sendError) {
          throw sendError
        }
      })
      this.addEventListener = (type: string, fn: (event: unknown) => void) => {
        this.listeners[type] = this.listeners[type] || []
        this.listeners[type].push(fn)
        onListenerRegistered?.(type)
      }
      this.removeEventListener = (type: string, fn: (event: unknown) => void) => {
        this.listeners[type] = this.listeners[type]?.filter((listener) => listener !== fn) || []
      }
      this.triggerOpen = () => {
        this.readyState = MockWebSocket.OPEN
        this.listeners['open']?.forEach((fn) => fn(new Event('open')))
      }
      this.triggerClose = (event: { code: number; reason: string; wasClean: boolean }) => {
        this.readyState = MockWebSocket.CLOSED
        this.listeners['close']?.forEach((fn) => fn(event))
      }
      this.triggerError = () => {
        this.listeners['error']?.forEach((fn) => fn(new Event('error')))
      }
      this.triggerMessage = (data: unknown) => {
        this.listeners['message']?.forEach((fn) => fn({ data }))
      }

      // Type boundary: capture the constructed mock instance so tests can trigger events on it.
      // oxlint-disable-next-line typescript/no-this-alias
      lastMockInstance = this
      mockInstances.push(this)

      if (autoOpen) {
        setTimeout(() => this.triggerOpen(), 0)
      }
      if (autoCloseDelay >= 0) {
        setTimeout(() => this.triggerClose({ code: 1000, reason: 'done', wasClean: true }), autoCloseDelay)
      }
    }
  }
}

function createDeferred<T>() {
  let resolveValue: (value: T) => void = () => undefined
  const promise = new Promise<T>((resolve) => {
    resolveValue = resolve
  })
  return { promise, resolve: resolveValue }
}

function encodeMessage(value: unknown): ArrayBuffer {
  return new TextEncoder().encode(JSON.stringify(value)).buffer as ArrayBuffer
}

describe('web socket runtime environment edge cases', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    lastMockInstance = undefined
    mockInstances = []
  })

  async function run(client: Client, command: unknown, options?: unknown): Promise<SocketAwaitResult<unknown, unknown>> {
    return client.execute(command as never, options as never) as Promise<SocketAwaitResult<unknown, unknown>>
  }

  test('should return transport error when WebSocket constructor throws', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ throwOnConstruct: new Error('connection refused') }))

    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
      incoming: {},
      path: '/ws/test',
    })

    const client = createClient(withEndpoint('http://localhost'))
    const [error, socket, connection] = await run(client, useSocket())

    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(error?.kind).toBe('transport')
  })

  test('should return transport error when WebSocket constructor throws non-Error', async () => {
    vi.stubGlobal(
      'WebSocket',
      createMockWebSocketClass({
        // @ts-expect-error testing runtime defensive behavior when constructor throws a non-Error value
        throwOnConstruct: 'connection refused',
      }),
    )

    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
      incoming: {},
      path: '/ws/test',
    })

    const client = createClient(withEndpoint('http://localhost'))
    const [error, socket, connection] = await run(client, useSocket())

    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(error?.kind).toBe('transport')
    expect(error?.message).toBe('Network error')
  })

  test('should finish startup with aborted transport error when aborted before open', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ autoOpen: false }))

    const controller = new AbortController()
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
      incoming: {},
      path: '/ws/test',
    })

    const client = createClient(withEndpoint('http://localhost'))
    const executePromise = run(client, useSocket(), { signal: controller.signal })

    setTimeout(() => controller.abort(ERR_ABORTED), 10)

    const [error, socket, connection] = await executePromise

    expect(socket).toBeUndefined()
    expect(connection?.url).toBe('ws://localhost/ws/test')
    expect(error?.kind).toBe('transport')
    expect(error?.code).toBe('ABORTED')
  })

  test('should preserve a pre-aborted timeout without constructing a physical socket', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const controller = new AbortController()
    controller.abort(new DOMException('deadline expired', 'TimeoutError'))
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })

    const [error, socket, connection] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      signal: controller.signal,
    })

    expect(error).toMatchObject({ code: 'TIMEOUT', kind: 'transport', message: 'Request timed out' })
    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(mockInstances).toHaveLength(0)
  })

  test('should prefer invalid timeout validation over an already aborted signal', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const controller = new AbortController()
    controller.abort('caller stopped')
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })

    const [error, socket, connection] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      signal: controller.signal,
      timeout: 0,
    })

    expect(error).toMatchObject({ code: 'REQUEST_VALIDATION_FAILED', kind: 'definition' })
    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(mockInstances).toHaveLength(0)
  })

  test('should treat a plain timeout-message Error abort reason as an abort', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const controller = new AbortController()
    controller.abort(new Error('Request timed out'))
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })

    const [error, socket, connection] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      signal: controller.signal,
    })

    expect(error).toMatchObject({ code: 'ABORTED', kind: 'transport' })
    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(mockInstances).toHaveLength(0)
  })

  test('should read the timeout option once before any asynchronous work', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    let timeoutReads = 0
    const options = {
      get timeout() {
        timeoutReads += 1
        return timeoutReads === 1 ? undefined : Number.POSITIVE_INFINITY
      },
    }
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })

    const [error, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), options)

    expect(error).toBeNull()
    expect(timeoutReads).toBe(1)
    expect(mockInstances).toHaveLength(1)
    socket?.close(1000, 'done')
    await socket?.closed
  })

  test('should return a definition error when snapshotting the abort option throws', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const getterFailure = new Error('abort getter failed')
    const options = {
      get abort(): AbortSignal | undefined {
        throw getterFailure
      },
    }
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })

    const result = await run(createClient(withEndpoint('http://localhost')), useSocket(), options)

    expect(result).toEqual([
      expect.objectContaining({ cause: getterFailure, code: 'REQUEST_VALIDATION_FAILED', kind: 'definition' }),
      undefined,
      undefined,
    ])
    expect(mockInstances).toHaveLength(0)
  })

  test.each(['heartbeat', 'reconnect'] as const)(
    'should return a definition error when reading the top-level %s option throws',
    async (option) => {
      vi.stubGlobal('WebSocket', createMockWebSocketClass())
      const getterFailure = new Error(`${option} getter failed`)
      const options = Object.defineProperty({}, option, {
        get() {
          throw getterFailure
        },
      })
      const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })

      const [error, socket, connection] = await run(createClient(withEndpoint('http://localhost')), useSocket(), options)

      expect(error).toMatchObject({ cause: getterFailure, code: 'REQUEST_VALIDATION_FAILED', kind: 'definition' })
      expect(socket).toBeUndefined()
      expect(connection).toBeUndefined()
      expect(mockInstances).toHaveLength(0)
    },
  )

  test('should snapshot configured protocols before beforeConnect mutates their source', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const protocols = ['snapshot-protocol']
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })

    const [error, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      beforeConnect() {
        protocols[0] = 'mutated-protocol'
      },
      protocols,
    })

    expect(error).toBeNull()
    expect(lastMockInstance?.protocol).toBe('snapshot-protocol')
    socket?.close(1000, 'done')
    await socket?.closed
  })

  test.each([-1, 0, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])(
    'should reject invalid websocket timeout %s before constructing a physical socket',
    async (timeout) => {
      vi.stubGlobal('WebSocket', createMockWebSocketClass())
      const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })

      const result = await run(createClient(withEndpoint('http://localhost')), useSocket(), { timeout })

      expect(result).toEqual([expect.objectContaining({ code: 'REQUEST_VALIDATION_FAILED', kind: 'definition' }), undefined, undefined])
      expect(mockInstances).toHaveLength(0)
    },
  )

  test('should observe an abort issued by an interceptor before the transport handler starts', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const controller = new AbortController()
    const abortingInterceptor = createWebSocketInterceptor((request, next) => {
      controller.abort(ERR_ABORTED)
      return next(request)
    })
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })

    const [error, socket, connection] = await run(
      createClient(withEndpoint('http://localhost'), withInterceptors(abortingInterceptor)),
      useSocket(),
      { signal: controller.signal },
    )

    expect(error).toMatchObject({ code: 'ABORTED', kind: 'transport' })
    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(mockInstances).toHaveLength(0)
  })

  test('should settle a hanging websocket interceptor when externally aborted', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const controller = new AbortController()
    const entered = createDeferred<void>()
    const hangingInterceptor = createWebSocketInterceptor(() => {
      entered.resolve(undefined)
      return new Promise<WebSocketSessionLike>(() => undefined)
    })
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const executePromise = run(createClient(withEndpoint('http://localhost'), withInterceptors(hangingInterceptor)), useSocket(), {
      signal: controller.signal,
    })

    await entered.promise
    controller.abort(ERR_ABORTED)
    const result = await Promise.race([executePromise, new Promise<false>((resolve) => setTimeout(() => resolve(false), 50))])

    expect(result).not.toBe(false)
    if (result === false) {
      throw new Error('Expected abort to settle the interceptor chain')
    }
    const [error, socket, connection] = result
    expect(error).toMatchObject({ code: 'ABORTED', kind: 'transport' })
    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(mockInstances).toHaveLength(0)
  })

  test('should settle a hanging websocket interceptor on timeout', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const entered = createDeferred<void>()
    const hangingInterceptor = createWebSocketInterceptor(() => {
      entered.resolve(undefined)
      return new Promise<WebSocketSessionLike>(() => undefined)
    })
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const executePromise = run(createClient(withEndpoint('http://localhost'), withInterceptors(hangingInterceptor)), useSocket(), {
      timeout: 5,
    })

    await entered.promise
    const result = await Promise.race([executePromise, new Promise<false>((resolve) => setTimeout(() => resolve(false), 50))])

    expect(result).not.toBe(false)
    if (result === false) {
      throw new Error('Expected timeout to settle the interceptor chain')
    }
    const [error, socket, connection] = result
    expect(error).toMatchObject({ code: 'TIMEOUT', kind: 'transport' })
    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(mockInstances).toHaveLength(0)
  })

  test('should not construct a physical socket when abort follows transport handler invocation', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const controller = new AbortController()
    const abortingInterceptor = createWebSocketInterceptor((request, next) => {
      const pendingSession = next(request)
      controller.abort(ERR_ABORTED)
      return pendingSession
    })
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })

    const [error, socket, connection] = await run(
      createClient(withEndpoint('http://localhost'), withInterceptors(abortingInterceptor)),
      useSocket(),
      { signal: controller.signal },
    )

    expect(error).toMatchObject({ code: 'ABORTED', kind: 'transport' })
    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(mockInstances).toHaveLength(0)
  })

  test('should prefer an abort that follows a pre-open close in the same turn', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ autoOpen: false }))
    const controller = new AbortController()
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const executePromise = run(createClient(withEndpoint('http://localhost')), useSocket(), { signal: controller.signal })

    await vi.waitFor(() => expect(lastMockInstance).toBeDefined())
    lastMockInstance?.triggerClose({ code: 1006, reason: 'early close', wasClean: false })
    controller.abort(ERR_ABORTED)

    const [error, socket, connection] = await executePromise
    expect(error).toMatchObject({ code: 'ABORTED', kind: 'transport' })
    expect(socket).toBeUndefined()
    expect(connection).toMatchObject({ generation: 0 })
  })

  test('should report a transport error when the peer closes before open without a native cause', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ autoOpen: false }))
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const executePromise = run(createClient(withEndpoint('http://localhost')), useSocket())

    await vi.waitFor(() => expect(lastMockInstance).toBeDefined())
    lastMockInstance?.triggerClose({ code: 1006, reason: 'early close', wasClean: false })

    const [error, socket, connection] = await executePromise
    expect(error).toMatchObject({ code: 'NETWORK_ERROR', kind: 'transport', message: 'WebSocket closed before open' })
    expect(socket).toBeUndefined()
    expect(connection).toMatchObject({ generation: 0 })
  })

  test('should surface a startup timeout while waiting for the physical socket to open', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ autoOpen: false }))
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })

    const [error, socket, connection] = await run(createClient(withEndpoint('http://localhost')), useSocket(), { timeout: 10 })

    expect(error).toMatchObject({ code: 'TIMEOUT', kind: 'transport' })
    expect(socket).toBeUndefined()
    expect(connection).toMatchObject({ generation: 0 })
  })

  test('should return transport error when WebSocket is not supported', async () => {
    const originalWebSocket = globalThis.WebSocket
    vi.stubGlobal('WebSocket', undefined)

    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
      incoming: {},
      path: '/ws/test',
    })

    const client = createClient(withEndpoint('http://localhost'))
    const [error, socket, connection] = await run(client, useSocket())

    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(error?.kind).toBe('transport')

    vi.stubGlobal('WebSocket', originalWebSocket)
  })

  test('should set duplicate open state only once', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ autoCloseDelay: 50 }))

    const states: string[] = []
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
      incoming: {},
      path: '/ws/test',
    })

    const client = createClient(withEndpoint('http://localhost'))
    const executePromise = run(client, useSocket())

    const [, socket] = await executePromise

    if (!socket) {
      throw new Error('Expected socket')
    }

    socket.onStateChange((state: string) => {
      states.push(state)
    })

    await new Promise((resolve) => setTimeout(resolve, 10))

    lastMockInstance?.triggerOpen()
    lastMockInstance?.triggerOpen()

    await expect(socket.closed).resolves.toMatchObject({ code: 1000 })
    // In the command-based API the listener can only be attached after the socket resolves,
    // so the first 'open' is not observable here. We still verify that duplicate open events
    // after the socket is already open do not emit additional 'open' states.
    expect(states.filter((state) => state === 'open')).toHaveLength(0)
  })

  test('should emit runtime error when send throws during queued flush', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ sendError: new Error('send failed') }))

    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
      maxOutgoingQueueSize: 1,
      incoming: {},
      outgoing: {
        msg: struct.object({ text: struct.string() }),
      },
      path: '/ws/test',
    })

    const client = createClient(
      withEndpoint('http://localhost'),
      withWebSocketHandle(globalThis.WebSocket),
      withWebSocketReconnect({ attempts: 1, delayMs: 50 }),
    )
    const [error, socket] = await run(client, useSocket())

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket')
    }

    let runtimeError: unknown
    socket.onRuntimeError((err: unknown) => {
      runtimeError = err
    })
    const pendingReceive = socket.receive[Symbol.asyncIterator]()
      .next()
      .catch((error: unknown) => error)

    await new Promise((resolve) => setTimeout(resolve, 10))
    lastMockInstance?.triggerClose({ code: 1000, reason: '', wasClean: true })
    await new Promise((resolve) => setTimeout(resolve, 10))

    socket.send({ type: 'msg', text: 'queued' })

    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(runtimeError).toBeDefined()
    await expect(socket.closed).resolves.toMatchObject({ kind: 'error' })
    await expect(pendingReceive).resolves.toMatchObject({ message: 'send failed' })
    expect(socket.state).toBe('error')
  })

  test('should set binaryType to arraybuffer on socket creation', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ autoCloseDelay: 50 }))

    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
      incoming: {},
      path: '/ws/test',
    })

    const client = createClient(withEndpoint('http://localhost'))
    const [, socket] = await run(client, useSocket())

    expect(socket).toBeDefined()
    expect(lastMockInstance?.binaryType).toBe('arraybuffer')
  })

  test('should run heartbeat through an injected handle without global WebSocket', async () => {
    const InjectedWebSocket = createMockWebSocketClass()
    vi.stubGlobal('WebSocket', undefined)
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 1,
      incoming: {},
      outgoing: { ping: struct.object({}) },
      path: '/ws/test',
    })
    const client = createClient(withEndpoint('http://localhost'), withWebSocketHandle(InjectedWebSocket))
    const [, socket] = await run(client, useSocket(), {
      heartbeat: { intervalMs: 5, message: () => ({ type: 'ping' }) },
    })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }

    await vi.waitFor(() => expect(lastMockInstance?.send).toHaveBeenCalled())
    socket.close(1000, 'done')
    await socket.closed
  })

  test('should stop a heartbeat callback that aborts the logical session before send or timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ autoOpen: false, emitCloseEvent: false }))
    const controller = new AbortController()
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 1,
      incoming: {},
      outgoing: { ping: struct.object({}) },
      path: '/ws/test',
    })
    const executePromise = run(createClient(withEndpoint('http://localhost')), useSocket(), {
      heartbeat: {
        intervalMs: 10,
        message() {
          controller.abort(ERR_ABORTED)
          return { type: 'ping' }
        },
        timeoutMs: 1_000,
      },
      signal: controller.signal,
    })

    await vi.waitFor(() => expect(lastMockInstance).toBeDefined())
    lastMockInstance?.triggerOpen()
    const [, socket] = await executePromise
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    const nativeSocket = lastMockInstance

    await vi.advanceTimersByTimeAsync(10)

    await expect(socket.closed).resolves.toMatchObject({ cause: ERR_ABORTED, kind: 'aborted' })
    await vi.advanceTimersByTimeAsync(0)
    expect(socket.state).toBe('aborted')
    expect(nativeSocket.send).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  test('should stop heartbeat timers only after accepting a valid manual close request', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ autoOpen: false, emitCloseEvent: false }))
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const executePromise = run(createClient(withEndpoint('http://localhost')), useSocket(), {
      heartbeat: { intervalMs: 100 },
    })

    await vi.waitFor(() => expect(lastMockInstance).toBeDefined())
    lastMockInstance?.triggerOpen()
    const [, socket] = await executePromise
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    const nativeSocket = lastMockInstance

    expect(vi.getTimerCount()).toBe(1)
    expect(() => socket.close(200, 'invalid')).toThrow(expect.objectContaining({ name: 'InvalidAccessError' }))
    expect(vi.getTimerCount()).toBe(1)

    socket.close(1000, 'owner closed')
    expect(socket.state).toBe('closing')
    expect(nativeSocket.close).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)

    nativeSocket.triggerClose({ code: 1000, reason: 'owner closed', wasClean: true })
    await expect(socket.closed).resolves.toMatchObject({ code: 1000, kind: 'closed', reason: 'owner closed' })
  })

  test('should preserve an external abort triggered by a closing observer', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ emitCloseEvent: false }))
    const controller = new AbortController()
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      signal: controller.signal,
    })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    const nativeSocket = lastMockInstance
    const states: string[] = []
    socket.onStateChange((state) => {
      states.push(state)
      if (state === 'closing') {
        controller.abort(ERR_ABORTED)
      }
    })

    socket.close(1000, 'owner closed')

    await expect(socket.closed).resolves.toMatchObject({ cause: ERR_ABORTED, kind: 'aborted' })
    expect(socket.state).toBe('aborted')
    expect(states).toEqual(['closing', 'aborted'])
    expect(nativeSocket.close).toHaveBeenCalledTimes(1)
  })

  test('should not acknowledge through a heartbeat runtime removed by its isAck callback', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ autoOpen: false, emitCloseEvent: false }))
    const controller = new AbortController()
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 1,
      incoming: { pong: struct.object({ ok: struct.boolean() }) },
      path: '/ws/test',
    })
    const executePromise = run(createClient(withEndpoint('http://localhost')), useSocket(), {
      heartbeat: {
        intervalMs: 1_000,
        isAck() {
          controller.abort(ERR_ABORTED)
          return true
        },
      },
      signal: controller.signal,
    })

    await vi.waitFor(() => expect(lastMockInstance).toBeDefined())
    lastMockInstance?.triggerOpen()
    const [, socket] = await executePromise
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    const nativeSocket = lastMockInstance
    const pendingReceive = socket.receive[Symbol.asyncIterator]()
      .next()
      .catch((error: unknown) => error)

    nativeSocket.triggerMessage(JSON.stringify({ ok: true, type: 'pong' }))
    await vi.advanceTimersByTimeAsync(0)

    await expect(socket.closed).resolves.toMatchObject({ cause: ERR_ABORTED, kind: 'aborted' })
    await expect(pendingReceive).resolves.toBe(ERR_ABORTED)
    expect(socket.state).toBe('aborted')
    expect(nativeSocket.close).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  test('should ignore an isAck rejection after the callback aborts its heartbeat session', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ autoOpen: false, emitCloseEvent: false }))
    const controller = new AbortController()
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 1,
      incoming: { pong: struct.object({ ok: struct.boolean() }) },
      path: '/ws/test',
    })
    const executePromise = run(createClient(withEndpoint('http://localhost')), useSocket(), {
      heartbeat: {
        intervalMs: 1_000,
        isAck() {
          controller.abort(ERR_ABORTED)
          throw new Error('late classifier failure')
        },
      },
      signal: controller.signal,
    })

    await vi.waitFor(() => expect(lastMockInstance).toBeDefined())
    lastMockInstance?.triggerOpen()
    const [, socket] = await executePromise
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    const nativeSocket = lastMockInstance
    const pendingReceive = socket.receive[Symbol.asyncIterator]()
      .next()
      .catch((error: unknown) => error)

    nativeSocket.triggerMessage(JSON.stringify({ ok: true, type: 'pong' }))
    await vi.advanceTimersByTimeAsync(0)

    await expect(socket.closed).resolves.toMatchObject({ cause: ERR_ABORTED, kind: 'aborted' })
    await expect(pendingReceive).resolves.toBe(ERR_ABORTED)
    expect(socket.state).toBe('aborted')
    expect(nativeSocket.close).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  test('should snapshot heartbeat config before beforeConnect can mutate it', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ autoOpen: false }))
    let configuredInterval = 20
    let intervalReads = 0
    const heartbeat = {
      get intervalMs() {
        intervalReads += 1
        return intervalReads === 1 ? configuredInterval : Number.POSITIVE_INFINITY
      },
      message: () => ({ type: 'ping' as const }),
    }
    let socketExistedDuringHook = false
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 1,
      incoming: {},
      outgoing: { ping: struct.object({}) },
      path: '/ws/test',
    })

    const executePromise = run(createClient(withEndpoint('http://localhost')), useSocket(), {
      beforeConnect() {
        socketExistedDuringHook = typeof lastMockInstance !== 'undefined'
        configuredInterval = Number.POSITIVE_INFINITY
      },
      heartbeat,
    })

    await vi.waitFor(() => expect(lastMockInstance).toBeDefined())
    expect(socketExistedDuringHook).toBe(false)
    expect(intervalReads).toBe(1)
    expect(() => lastMockInstance?.triggerOpen()).not.toThrow()
    const [error, socket] = await executePromise
    expect(error).toBeNull()
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    await vi.waitFor(() => expect(lastMockInstance?.send).toHaveBeenCalled())
    socket.close(1000, 'done')
    await socket.closed
  })

  test('should settle when abort fires during physical listener registration', async () => {
    const controller = new AbortController()
    let abortedDuringRegistration = false
    vi.stubGlobal(
      'WebSocket',
      createMockWebSocketClass({
        autoOpen: false,
        onListenerRegistered(type) {
          if (type === 'error' && !abortedDuringRegistration) {
            abortedDuringRegistration = true
            controller.abort(ERR_ABORTED)
          }
        },
      }),
    )
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })

    const [error, socket, connection] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      signal: controller.signal,
    })

    expect(abortedDuringRegistration).toBe(true)
    expect(error).toMatchObject({ code: 'ABORTED', kind: 'transport' })
    expect(socket).toBeUndefined()
    expect(connection).toMatchObject({ generation: 0 })
    expect(lastMockInstance?.close).toHaveBeenCalledTimes(1)
  })

  test('should return a definition error when a heartbeat snapshot getter throws', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const snapshotFailure = new Error('heartbeat getter failed')
    const heartbeat = {
      intervalMs: 20,
      get message(): () => never {
        throw snapshotFailure
      },
    }
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })

    const [error, socket, connection] = await run(createClient(withEndpoint('http://localhost')), useSocket(), { heartbeat })

    expect(error).toMatchObject({ cause: snapshotFailure, code: 'REQUEST_VALIDATION_FAILED', kind: 'definition' })
    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(lastMockInstance).toBeUndefined()
  })

  test('should surface runtime cause on error event before close', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ autoCloseDelay: 50 }))

    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 16,
      incoming: {},
      path: '/ws/test',
    })

    const client = createClient(withEndpoint('http://localhost'))
    const [error, socket] = await run(client, useSocket())

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket')
    }

    await new Promise((resolve) => setTimeout(resolve, 10))
    lastMockInstance?.triggerError()

    const closeInfo = await socket.closed
    expect(closeInfo).toMatchObject({ kind: 'error' })
  })

  test('should wait for the errored physical socket close before constructing its replacement', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ closeEventDelayMs: 40 }))
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      reconnect: { attempts: 1, delayMs: 0 },
    })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    const firstSocket = lastMockInstance

    firstSocket.triggerError()
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(mockInstances).toHaveLength(1)
    expect(firstSocket.close).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(mockInstances).toHaveLength(2))
    expect(socket.connection.generation).toBe(2)

    socket.close(1000, 'done')
    await socket.closed
  })

  test('should fail after a bounded grace when an errored socket never emits close', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ autoOpen: false, emitCloseEvent: false }))
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const executePromise = run(createClient(withEndpoint('http://localhost')), useSocket(), {
      reconnect: { attempts: 1, delayMs: 0 },
    })

    await vi.waitFor(() => expect(lastMockInstance).toBeDefined())
    lastMockInstance?.triggerOpen()
    const [, socket] = await executePromise
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    const nativeSocket = lastMockInstance
    const pendingReceive = socket.receive[Symbol.asyncIterator]()
      .next()
      .catch((error: unknown) => error)

    nativeSocket.triggerError()

    expect(nativeSocket.close).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(1_000)

    await expect(socket.closed).resolves.toMatchObject({ cause: expect.any(Error), kind: 'error' })
    await expect(pendingReceive).resolves.toMatchObject({ message: 'WebSocket connection error' })
    expect(socket.state).toBe('error')
    expect(mockInstances).toHaveLength(1)
    expect(nativeSocket.close).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  test('should settle an error attempt when native close throws synchronously', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ closeErrors: [new Error('close failed')] }))
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket())
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }

    lastMockInstance.triggerError()

    await expect(socket.closed).resolves.toMatchObject({ kind: 'error' })
    expect(socket.state).toBe('error')
    expect(lastMockInstance.close).toHaveBeenCalledTimes(1)
  })

  test('should finish without reconnecting or closing twice when error cleanup close throws', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ closeErrors: [new Error('close failed')] }))
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 1,
      maxOutgoingQueueSize: 1,
      incoming: {},
      outgoing: { message: struct.object({ text: struct.string() }) },
      path: '/ws/test',
    })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      reconnect: { attempts: 1, delayMs: 0 },
    })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    const failedSocket = lastMockInstance

    failedSocket.triggerError()

    await expect(socket.closed).resolves.toMatchObject({ kind: 'error' })
    expect(socket.state).toBe('error')
    expect(mockInstances).toHaveLength(1)
    expect(failedSocket.close).toHaveBeenCalledTimes(1)
    expect(() => socket.send({ text: 'late', type: 'message' })).toThrow(expect.objectContaining({ name: 'InvalidStateError' }))
    expect(failedSocket.close).toHaveBeenCalledTimes(1)
  })

  test.each([
    ['incoming', 0],
    ['incoming', -1],
    ['incoming', 1.5],
    ['incoming', Number.POSITIVE_INFINITY],
    ['incoming', Number.MAX_SAFE_INTEGER + 1],
    ['outgoing', -1],
    ['outgoing', 1.5],
    ['outgoing', Number.POSITIVE_INFINITY],
    ['outgoing', Number.MAX_SAFE_INTEGER + 1],
  ] as const)('should reject unsafe %s queue limit %s before constructing a socket', async (kind, value) => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const definition = {
      incoming: {},
      maxIncomingQueueSize: kind === 'incoming' ? value : 1,
      maxOutgoingQueueSize: kind === 'outgoing' ? value : 0,
      path: '/ws/test',
    }
    const useSocket = defineWebSocket(definition as never)

    const [error, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket())

    expect(socket).toBeUndefined()
    expect(error).toMatchObject({ code: 'REQUEST_VALIDATION_FAILED', kind: 'definition' })
    expect(lastMockInstance).toBeUndefined()
  })

  test('should expose generation and native bufferedAmount', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 1,
      incoming: {},
      path: '/ws/test',
    })

    const [, socket, connection] = await run(createClient(withEndpoint('http://localhost')), useSocket())
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }

    lastMockInstance.bufferedAmount = 23
    expect(connection?.generation).toBe(1)
    expect(socket.connection.generation).toBe(1)
    expect(socket.bufferedAmount).toBe(23)

    socket.close(1000, 'done')
    await socket.closed
    expect(socket.bufferedAmount).toBe(0)
  })

  test('should keep the success tuple on generation one when an interceptor returns after reconnect', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const gate = createDeferred<void>()
    let interceptedSession: WebSocketSessionLike | undefined
    const delayedInterceptor = createWebSocketInterceptor(async (request, next) => {
      interceptedSession = await next(request)
      await gate.promise
      return interceptedSession
    })
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const executePromise = run(createClient(withEndpoint('http://localhost'), withInterceptors(delayedInterceptor)), useSocket(), {
      reconnect: { attempts: 1, delayMs: 0 },
    })

    await vi.waitFor(() => expect(interceptedSession?.connection.generation).toBe(1))
    const firstSocket = lastMockInstance
    if (!firstSocket) {
      throw new Error('Expected first socket')
    }
    firstSocket.triggerClose({ code: 1012, reason: 'restart', wasClean: true })
    await vi.waitFor(() => expect(interceptedSession?.connection.generation).toBe(2))
    gate.resolve(undefined)

    const [error, socket, startupConnection] = await executePromise
    expect(error).toBeNull()
    expect(startupConnection?.generation).toBe(1)
    expect(socket?.connection.generation).toBe(2)
    socket?.close(1000, 'done')
    await socket?.closed
  })

  test('should reject a reconnect predicate getter failure before constructing a physical socket', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const getterFailure = new Error('reconnect predicate getter failed')
    const reconnect = {
      get shouldReconnect(): undefined {
        throw getterFailure
      },
    }
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })

    const [error, socket, connection] = await run(createClient(withEndpoint('http://localhost')), useSocket(), { reconnect })
    if (socket) {
      socket.close(1000, 'cleanup')
      await socket.closed
    }

    expect(error).toMatchObject({ cause: getterFailure, code: 'REQUEST_VALIDATION_FAILED', kind: 'definition' })
    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(mockInstances).toHaveLength(0)
  })

  test('should snapshot the reconnect predicate before beforeConnect can mutate it', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const reconnect = {
      attempts: 1,
      delayMs: 0,
      shouldReconnect: () => false,
    }
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      beforeConnect() {
        reconnect.shouldReconnect = () => true
      },
      reconnect,
    })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    const firstSocket = lastMockInstance

    firstSocket.triggerClose({ code: 1012, reason: 'restart', wasClean: true })
    const terminal = await Promise.race([socket.closed, new Promise<false>((resolve) => setTimeout(() => resolve(false), 50))])
    if (terminal === false) {
      socket.close(1000, 'cleanup')
      await socket.closed
    }

    expect(terminal).toMatchObject({ code: 1012, kind: 'closed', reason: 'restart' })
    expect(mockInstances).toHaveLength(1)
  })

  test('should settle a discarded interceptor session when native close never arrives', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ emitCloseEvent: false }))
    let discardedSession: WebSocketSessionLike | undefined
    const replacementSession: WebSocketSessionLike = {
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
    const interceptor = createWebSocketInterceptor(async (request, next) => {
      discardedSession = await next(request)
      return replacementSession
    })
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })

    const result = await Promise.race([
      run(createClient(withEndpoint('http://localhost'), withInterceptors(interceptor)), useSocket()),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 50)),
    ])

    expect(result).not.toBe(false)
    if (result === false) {
      throw new Error('Expected discarded session cleanup to settle execute')
    }
    const [error, socket] = result
    expect(error).toBeNull()
    expect(socket).toBe(replacementSession)
    await expect(discardedSession?.closed).resolves.toMatchObject({ kind: 'aborted' })
    expect(lastMockInstance?.close).toHaveBeenCalledTimes(1)
  })

  test('should preserve an interceptor error after its created session already settled', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const interceptorFailure = new Error('interceptor failed after close')
    const interceptor = createWebSocketInterceptor(async (request, next) => {
      const createdSession = await next(request)
      createdSession.close(1000, 'interceptor cleanup')
      await createdSession.closed
      throw interceptorFailure
    })
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })

    const [error, socket] = await run(createClient(withEndpoint('http://localhost'), withInterceptors(interceptor)), useSocket())

    expect(error).toBe(interceptorFailure)
    expect(socket).toBeUndefined()
    expect(lastMockInstance?.close).toHaveBeenCalledTimes(1)
  })

  test('should settle a pending fire-and-forget interceptor session after a successful short circuit', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ autoOpen: false }))
    const replacementSession: WebSocketSessionLike = {
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
    const interceptor = createWebSocketInterceptor(async (request, next) => {
      void next(request)
      await new Promise((resolve) => setTimeout(resolve, 0))
      return replacementSession
    })
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })

    const [error, socket] = await run(createClient(withEndpoint('http://localhost'), withInterceptors(interceptor)), useSocket())

    expect(error).toBeNull()
    expect(socket).toBe(replacementSession)
    expect(lastMockInstance?.close).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(lastMockInstance?.readyState).toBe(3))
    await expect(replacementSession.closed).resolves.toMatchObject({ kind: 'closed' })
  })

  test('should reject next invoked after a successful interceptor chain settles without constructing a socket', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const lateCall = createDeferred<unknown>()
    const replacementSession: WebSocketSessionLike = {
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
    const interceptor = createWebSocketInterceptor(async (request, next) => {
      setTimeout(() => {
        void next(request).then(lateCall.resolve, lateCall.resolve)
      }, 10)
      return replacementSession
    })
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })

    const [error, socket] = await run(createClient(withEndpoint('http://localhost'), withInterceptors(interceptor)), useSocket())
    const lateOutcome = await lateCall.promise

    expect(error).toBeNull()
    expect(socket).toBe(replacementSession)
    expect(lateOutcome).toMatchObject({ message: 'WebSocket interceptor next() may not be called after the chain settles' })
    expect(mockInstances).toHaveLength(0)
    await expect(replacementSession.closed).resolves.toMatchObject({ kind: 'closed' })
  })

  test.each([1001, 2999, 5000, 3000.5, Number.POSITIVE_INFINITY])(
    'should reject invalid close code %s without changing session state',
    async (code) => {
      vi.stubGlobal('WebSocket', createMockWebSocketClass())
      const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
      const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket())
      if (!socket || !lastMockInstance) {
        throw new Error('Expected socket')
      }

      expect(() => socket.close(code)).toThrow(expect.objectContaining({ name: 'InvalidAccessError' }))
      expect(socket.state).toBe('open')
      expect(lastMockInstance.close).not.toHaveBeenCalled()

      socket.close(1000, 'done')
      await socket.closed
    },
  )

  test('should reject a close reason over 123 UTF-8 bytes without changing session state', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket())
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }

    expect(() => socket.close(1000, `${'a'.repeat(121)}猫`)).toThrow(expect.objectContaining({ name: 'SyntaxError' }))
    expect(socket.state).toBe('open')
    expect(lastMockInstance.close).not.toHaveBeenCalled()

    socket.close(1000, 'done')
    await socket.closed
  })

  test('should isolate state and runtime observer failures', async () => {
    const reported: unknown[] = []
    vi.stubGlobal('reportError', (error: unknown) => reported.push(error))
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket())
    if (!socket) {
      throw new Error('Expected socket')
    }

    const states: string[] = []
    const runtimeErrors: unknown[] = []
    socket.onRuntimeError((error) => {
      runtimeErrors.push(error)
      throw new Error('runtime observer failed')
    })
    socket.onStateChange(() => {
      throw new Error('state observer failed')
    })
    socket.onStateChange((state) => states.push(state))

    socket.close(1000, 'done')
    await expect(socket.closed).resolves.toMatchObject({ kind: 'closed' })
    expect(states).toEqual(['closing', 'closed'])
    expect(runtimeErrors).toHaveLength(2)
    expect(reported).toHaveLength(2)
  })

  test('should route async state observer rejections through runtime observers without unhandled rejection', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket())
    if (!socket) {
      throw new Error('Expected socket')
    }
    const stateFailure = new Error('async state observer failed')
    const runtimeErrors: unknown[] = []
    socket.onRuntimeError((error) => runtimeErrors.push(error))
    socket.onStateChange(async () => {
      throw stateFailure
    })

    socket.close(1000, 'done')
    await socket.closed
    await Promise.resolve()
    await Promise.resolve()
    process.off('unhandledRejection', onUnhandled)

    expect(runtimeErrors).toEqual([stateFailure, stateFailure])
    expect(unhandled).toEqual([])
  })

  test('should report async runtime observer and reporter rejections without unhandled rejection', async () => {
    const reported: unknown[] = []
    vi.stubGlobal('reportError', async (error: unknown) => {
      reported.push(error)
      throw new Error('async reporter failed')
    })
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket())
    if (!socket) {
      throw new Error('Expected socket')
    }
    const runtimeFailure = new Error('async runtime observer failed')
    socket.onRuntimeError(async () => {
      throw runtimeFailure
    })
    socket.onStateChange(() => {
      throw new Error('state observer failed')
    })

    socket.close(1000, 'done')
    await socket.closed
    await Promise.resolve()
    await Promise.resolve()
    process.off('unhandledRejection', onUnhandled)

    expect(reported).toEqual([runtimeFailure, runtimeFailure])
    expect(unhandled).toEqual([])
  })

  test('should isolate observer failures when the runtime has no reportError hook', async () => {
    vi.stubGlobal('reportError', undefined)
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket())
    if (!socket) {
      throw new Error('Expected socket')
    }

    socket.onRuntimeError(() => {
      throw new Error('runtime observer failed without reportError')
    })
    socket.onStateChange(() => {
      throw new Error('observer failed without reportError')
    })
    socket.close(1000, 'done')

    await expect(socket.closed).resolves.toMatchObject({ kind: 'closed' })
    expect(socket.state).toBe('closed')
  })

  test('should release observers and return one no-op unsubscribe after terminal', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket())
    if (!socket) {
      throw new Error('Expected socket')
    }

    socket.onRuntimeError(vi.fn())
    socket.onStateChange(vi.fn())
    socket.close(1000, 'done')
    await socket.closed

    const unsubscribeRuntime = socket.onRuntimeError(vi.fn())
    const unsubscribeState = socket.onStateChange(vi.fn())

    expect(unsubscribeRuntime).toBe(unsubscribeState)
    expect(unsubscribeRuntime()).toBeUndefined()
  })

  test('should preserve physical message arrival order when Blob decodes finish out of order', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 2,
      incoming: { message: struct.object({ text: struct.string() }) },
      path: '/ws/test',
    })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket())
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }

    const firstData = createDeferred<ArrayBuffer>()
    const secondData = createDeferred<ArrayBuffer>()
    const firstBlob = new Blob()
    const secondBlob = new Blob()
    vi.spyOn(firstBlob, 'arrayBuffer').mockReturnValue(firstData.promise)
    vi.spyOn(secondBlob, 'arrayBuffer').mockReturnValue(secondData.promise)
    const iterator = socket.receive[Symbol.asyncIterator]()

    lastMockInstance.triggerMessage(firstBlob)
    lastMockInstance.triggerMessage(secondBlob)
    secondData.resolve(encodeMessage({ text: 'second', type: 'message' }))
    await Promise.resolve()
    firstData.resolve(encodeMessage({ text: 'first', type: 'message' }))

    await expect(iterator.next()).resolves.toEqual({ done: false, value: { text: 'first', type: 'message' } })
    await expect(iterator.next()).resolves.toEqual({ done: false, value: { text: 'second', type: 'message' } })
    socket.close(1000, 'done')
    await socket.closed
  })

  test('should deliver an arrived Blob frame before the following native close', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 1,
      incoming: { message: struct.object({ text: struct.string() }) },
      path: '/ws/test',
    })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket())
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }

    const data = createDeferred<ArrayBuffer>()
    const blob = new Blob()
    vi.spyOn(blob, 'arrayBuffer').mockReturnValue(data.promise)
    const iterator = socket.receive[Symbol.asyncIterator]()

    lastMockInstance.triggerMessage(blob)
    lastMockInstance.triggerClose({ code: 1000, reason: 'done', wasClean: true })
    lastMockInstance.triggerClose({ code: 1000, reason: 'duplicate', wasClean: true })
    data.resolve(encodeMessage({ text: 'before close', type: 'message' }))

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { text: 'before close', type: 'message' },
    })
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(socket.closed).resolves.toMatchObject({ kind: 'closed' })
  })

  test('should classify an arrived heartbeat ack while draining after native close', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 1,
      incoming: { pong: struct.object({ ok: struct.boolean() }) },
      path: '/ws/test',
    })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      heartbeat: {
        intervalMs: 1_000,
        isAck: (message: { type: string }) => message.type === 'pong',
      },
    })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }

    const data = createDeferred<ArrayBuffer>()
    const blob = new Blob()
    vi.spyOn(blob, 'arrayBuffer').mockReturnValue(data.promise)
    const iterator = socket.receive[Symbol.asyncIterator]()

    lastMockInstance.triggerMessage(blob)
    lastMockInstance.triggerClose({ code: 1000, reason: 'done', wasClean: true })
    data.resolve(encodeMessage({ ok: true, type: 'pong' }))

    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(socket.closed).resolves.toMatchObject({ kind: 'closed' })
  })

  test('should retain the heartbeat classifier while draining an arrived ack after manual close', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 1,
      incoming: { pong: struct.object({ ok: struct.boolean() }) },
      path: '/ws/test',
    })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      heartbeat: {
        intervalMs: 1_000,
        isAck: (message: { type: string }) => message.type === 'pong',
      },
    })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }

    const data = createDeferred<ArrayBuffer>()
    const blob = new Blob()
    vi.spyOn(blob, 'arrayBuffer').mockReturnValue(data.promise)
    const iterator = socket.receive[Symbol.asyncIterator]()

    lastMockInstance.triggerMessage(blob)
    socket.close(1000, 'owner done')
    await new Promise((resolve) => setTimeout(resolve, 0))
    data.resolve(encodeMessage({ ok: true, type: 'pong' }))

    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(socket.closed).resolves.toMatchObject({ code: 1000, kind: 'closed', reason: 'owner done' })
  })

  test('should terminate when undecoded raw frames exceed the endpoint bound', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 2,
      incoming: { message: struct.object({ text: struct.string() }) },
      path: '/ws/test',
    })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket())
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }

    const blockedBlob = new Blob()
    vi.spyOn(blockedBlob, 'arrayBuffer').mockReturnValue(new Promise<ArrayBuffer>(() => undefined))
    lastMockInstance.triggerMessage(blockedBlob)
    for (let index = 0; index < 3; index += 1) {
      lastMockInstance.triggerMessage(JSON.stringify({ text: `queued-${index}`, type: 'message' }))
    }

    await expect(
      Promise.race([socket.closed, new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 100))]),
    ).resolves.toMatchObject({ kind: 'error' })
    expect(socket.state).toBe('error')
  })

  test('should not wait for a blocked Blob after a native error close', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 2,
      incoming: { message: struct.object({ text: struct.string() }) },
      path: '/ws/test',
    })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket())
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }

    const blockedBlob = new Blob()
    vi.spyOn(blockedBlob, 'arrayBuffer').mockReturnValue(new Promise<ArrayBuffer>(() => undefined))
    lastMockInstance.triggerMessage(blockedBlob)
    lastMockInstance.triggerError()

    await expect(
      Promise.race([socket.closed, new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 100))]),
    ).resolves.toMatchObject({ kind: 'error' })
    expect(socket.state).toBe('error')
  })

  test.each(['error', 'close'] as const)(
    'should settle a native %s as closed when the reconnect predicate explicitly declines',
    async (eventKind) => {
      vi.stubGlobal('WebSocket', createMockWebSocketClass())
      const predicate = vi.fn(() => false)
      const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
      const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
        reconnect: { attempts: 1, delayMs: 0, shouldReconnect: predicate },
      })
      if (!socket || !lastMockInstance) {
        throw new Error('Expected socket')
      }
      const pendingReceive = socket.receive[Symbol.asyncIterator]().next()

      if (eventKind === 'error') {
        lastMockInstance.triggerError()
      } else {
        lastMockInstance.triggerClose({ code: 1012, reason: 'restart', wasClean: true })
      }

      await expect(socket.closed).resolves.toMatchObject({ kind: 'closed' })
      await expect(pendingReceive).resolves.toEqual({ done: true, value: undefined })
      expect(socket.state).toBe('closed')
      expect(predicate).toHaveBeenCalledTimes(1)
    },
  )

  test.each(['return false', 'throw'] as const)(
    'should prefer an abort when reconnect policy callbacks %s after aborting',
    async (policyOutcome) => {
      vi.stubGlobal('WebSocket', createMockWebSocketClass())
      const controller = new AbortController()
      const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
      const predicate = vi.fn(() => {
        controller.abort(ERR_ABORTED)
        if (policyOutcome === 'throw') {
          throw new Error('policy failed after abort')
        }
        return false
      })
      const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
        reconnect: { attempts: 1, delayMs: 0, shouldReconnect: predicate },
        signal: controller.signal,
      })
      if (!socket || !lastMockInstance) {
        throw new Error('Expected socket')
      }
      const pendingReceive = socket.receive[Symbol.asyncIterator]()
        .next()
        .catch((error: unknown) => error)

      lastMockInstance.triggerClose({ code: 1012, reason: 'restart', wasClean: true })

      await expect(socket.closed).resolves.toMatchObject({ cause: ERR_ABORTED, kind: 'aborted' })
      await expect(pendingReceive).resolves.toBe(ERR_ABORTED)
      expect(socket.state).toBe('aborted')
      expect(predicate).toHaveBeenCalledTimes(1)
      expect(mockInstances).toHaveLength(1)
    },
  )

  test('should preserve terminal state when reconnect predicate closes the session and returns true', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    let exposedSocket: SocketAwaitResult<unknown, unknown>[1]
    const predicate = vi.fn(() => {
      exposedSocket?.close(1000, 'owner declined')
      return true
    })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      reconnect: { attempts: 1, delayMs: 0, shouldReconnect: predicate },
    })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    exposedSocket = socket

    lastMockInstance.triggerClose({ code: 1012, reason: 'restart', wasClean: true })

    await expect(socket.closed).resolves.toMatchObject({ kind: 'closed' })
    await Promise.resolve()
    await Promise.resolve()
    expect(socket.state).toBe('closed')
    expect(mockInstances).toHaveLength(1)
    expect(predicate).toHaveBeenCalledTimes(1)
  })

  test('should preserve owner close when reconnect predicate throws after closing the session', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    let exposedSocket: SocketAwaitResult<unknown, unknown>[1]
    const predicate = vi.fn(() => {
      exposedSocket?.close(1000, 'owner declined')
      throw new Error('ignored after owner close')
    })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      reconnect: { attempts: 1, delayMs: 0, shouldReconnect: predicate },
    })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    exposedSocket = socket

    lastMockInstance.triggerClose({ code: 1012, reason: 'restart', wasClean: true })

    await expect(socket.closed).resolves.toMatchObject({ code: 1000, kind: 'closed', reason: 'owner declined' })
    expect(socket.state).toBe('closed')
    expect(mockInstances).toHaveLength(1)
    expect(predicate).toHaveBeenCalledTimes(1)
  })

  test('should preserve an abort triggered by an observer during replacement open', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const controller = new AbortController()
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      reconnect: { attempts: 1, delayMs: 0 },
      signal: controller.signal,
    })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    socket.onStateChange((state) => {
      if (state === 'open' && socket.connection.generation === 2) {
        controller.abort(ERR_ABORTED)
      }
    })

    lastMockInstance.triggerClose({ code: 1012, reason: 'restart', wasClean: true })

    await expect(socket.closed).resolves.toMatchObject({ kind: 'aborted' })
    expect(socket.state).toBe('aborted')
    expect(mockInstances).toHaveLength(2)
  })

  test('should stop reconnect work when a reconnecting observer closes the logical session', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const random = vi.spyOn(Math, 'random').mockReturnValue(1)
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      reconnect: {
        attempts: 1,
        delayMs: Number.MAX_VALUE,
        jitter: 1,
        maxDelayMs: Number.MAX_VALUE,
      },
    })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    socket.onStateChange((state) => {
      if (state === 'reconnecting') {
        socket.close(1000, 'observer stopped reconnect')
      }
    })

    lastMockInstance.triggerClose({ code: 1012, reason: 'restart', wasClean: true })
    const closeInfo = await socket.closed

    expect(closeInfo).toMatchObject({ code: 1000, kind: 'closed', reason: 'observer stopped reconnect' })
    expect(socket.state).toBe('closed')
    expect(random).not.toHaveBeenCalled()
    expect(mockInstances).toHaveLength(1)
    random.mockRestore()
  })

  test('should prefer observer abort over reconnect jitter overflow', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const controller = new AbortController()
    const random = vi.spyOn(Math, 'random').mockReturnValue(1)
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      reconnect: {
        attempts: 1,
        delayMs: Number.MAX_VALUE,
        jitter: 1,
        maxDelayMs: Number.MAX_VALUE,
      },
      signal: controller.signal,
    })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    socket.onStateChange((state) => {
      if (state === 'reconnecting') {
        controller.abort(ERR_ABORTED)
      }
    })

    lastMockInstance.triggerClose({ code: 1012, reason: 'restart', wasClean: true })
    const closeInfo = await socket.closed

    expect(closeInfo).toMatchObject({ cause: ERR_ABORTED, kind: 'aborted' })
    expect(socket.state).toBe('aborted')
    expect(random).not.toHaveBeenCalled()
    expect(mockInstances).toHaveLength(1)
    random.mockRestore()
  })

  test('should not settle twice when owner close interrupts an active reconnect delay', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const reconnecting = createDeferred<void>()
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      reconnect: { attempts: 1, delayMs: 1_000 },
    })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    socket.onStateChange((state) => {
      if (state === 'reconnecting') {
        reconnecting.resolve(undefined)
      }
    })

    lastMockInstance.triggerClose({ code: 1012, reason: 'restart', wasClean: true })
    await reconnecting.promise
    socket.close(1000, 'owner stopped delay')

    await expect(socket.closed).resolves.toMatchObject({ code: 1000, kind: 'closed', reason: 'owner stopped delay' })
    expect(socket.state).toBe('closed')
    expect(mockInstances).toHaveLength(1)
  })

  test('should settle when finite reconnect inputs overflow during jitter computation', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const random = vi.spyOn(Math, 'random').mockReturnValue(1)
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      reconnect: {
        attempts: 1,
        delayMs: Number.MAX_VALUE,
        jitter: 1,
        maxDelayMs: Number.MAX_VALUE,
      },
    })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    const pendingReceive = socket.receive[Symbol.asyncIterator]()
      .next()
      .catch((error: unknown) => error)

    lastMockInstance.triggerClose({ code: 1012, reason: 'restart', wasClean: true })
    const closeInfo = await socket.closed
    random.mockRestore()

    expect(closeInfo).toMatchObject({
      cause: expect.objectContaining({ message: 'WebSocket reconnect delay must be finite' }),
      kind: 'error',
    })
    await expect(pendingReceive).resolves.toMatchObject({ message: 'WebSocket reconnect delay must be finite' })
    expect(socket.state).toBe('error')
    expect(mockInstances).toHaveLength(1)
  })

  test('should skip post-open setup when an observer closes the replacement', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      reconnect: { attempts: 1, delayMs: 0 },
    })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    socket.onStateChange((state) => {
      if (state === 'open' && socket.connection.generation === 2) {
        socket.close(1000, 'observer stopped replacement')
      }
    })

    lastMockInstance.triggerClose({ code: 1012, reason: 'restart', wasClean: true })

    await expect(socket.closed).resolves.toMatchObject({ code: 1000, kind: 'closed', reason: 'observer stopped replacement' })
    expect(socket.state).toBe('closed')
    expect(mockInstances).toHaveLength(2)
  })

  test('should fail the logical session and discard buffered messages on incoming overflow', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 1,
      incoming: { message: struct.object({ text: struct.string() }) },
      path: '/ws/test',
    })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket())
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }

    const iterator = socket.receive[Symbol.asyncIterator]()
    lastMockInstance.triggerMessage(JSON.stringify({ type: 'message', text: 'first' }))
    lastMockInstance.triggerMessage(JSON.stringify({ type: 'message', text: 'second' }))

    await expect(socket.closed).resolves.toMatchObject({ kind: 'error' })
    await expect(iterator.next()).rejects.toThrow('AsyncQueue overflow')
    expect(socket.state).toBe('error')
  })

  test('should abort-race beforeConnect and consume its late rejection', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const controller = new AbortController()
    const contexts: Array<{ attempt: number; signal: AbortSignal }> = []
    let rejectHook: ((reason: unknown) => void) | undefined
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })

    const executePromise = run(createClient(withEndpoint('http://localhost')), useSocket(), {
      beforeConnect(context: { attempt: number; signal: AbortSignal }) {
        contexts.push(context)
        return new Promise<void>((_resolve, reject) => {
          rejectHook = reject
        })
      },
      signal: controller.signal,
    })

    await vi.waitFor(() => expect(contexts).toHaveLength(1))
    controller.abort(ERR_ABORTED)
    const result = await Promise.race([executePromise, new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 100))])

    expect(result).not.toBe('pending')
    expect(contexts[0]?.attempt).toBe(0)
    expect(contexts[0]?.signal.aborted).toBe(true)
    expect(lastMockInstance).toBeUndefined()
    if (result === 'pending') {
      throw new Error('beforeConnect cancellation did not settle')
    }
    expect(result[0]).toMatchObject({ code: 'ABORTED', kind: 'transport' })

    rejectHook?.(new Error('late hook rejection'))
    await Promise.resolve()
    await Promise.resolve()
  })

  test('should settle the active attempt when abort close cannot produce a close event', async () => {
    const closeFailure = new Error('native close failed')
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ closeErrors: [closeFailure] }))
    const controller = new AbortController()
    const shouldReconnect = vi.fn(() => true)
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      reconnect: { attempts: 1, delayMs: 0, shouldReconnect },
      signal: controller.signal,
    })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }

    controller.abort(ERR_ABORTED)

    await expect(
      Promise.race([socket.closed, new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 100))]),
    ).resolves.toMatchObject({ kind: 'aborted' })
    await Promise.resolve()
    expect(lastMockInstance.close).toHaveBeenCalledTimes(1)
    expect(shouldReconnect).not.toHaveBeenCalled()
  })

  test('should preserve the last opened connection snapshot when aborting a connecting replacement', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ autoOpen: false }))
    const controller = new AbortController()
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const executePromise = run(createClient(withEndpoint('http://localhost')), useSocket(), {
      reconnect: { attempts: 1, delayMs: 0 },
      signal: controller.signal,
    })

    await vi.waitFor(() => expect(mockInstances).toHaveLength(1))
    const firstSocket = mockInstances[0]
    if (!firstSocket) {
      throw new Error('Expected first socket')
    }
    firstSocket.protocol = 'first'
    firstSocket.triggerOpen()
    const [, socket] = await executePromise
    if (!socket) {
      throw new Error('Expected logical session')
    }
    const openedConnection = socket.connection

    firstSocket.triggerClose({ code: 1012, reason: 'restart', wasClean: true })
    await vi.waitFor(() => expect(mockInstances).toHaveLength(2))
    const replacement = mockInstances[1]
    if (!replacement) {
      throw new Error('Expected replacement socket')
    }
    replacement.protocol = 'replacement'
    controller.abort(ERR_ABORTED)

    await expect(socket.closed).resolves.toMatchObject({ kind: 'aborted' })
    await Promise.resolve()
    await Promise.resolve()
    expect(socket.connection).toEqual(openedConnection)
    expect(socket.connection).toMatchObject({ generation: 1, protocol: 'first' })
  })

  test('should use one fallback close, rethrow the first error, and wait for the close event', async () => {
    const firstFailure = new Error('first close failed')
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ closeErrors: [firstFailure] }))
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket())
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }

    expect(() => socket.close(3000, 'owner close')).toThrow(firstFailure)
    expect(socket.state).toBe('closing')
    expect(lastMockInstance.close).toHaveBeenCalledTimes(2)
    expect(() => socket.close(200, 'invalid while closing')).toThrow(expect.objectContaining({ name: 'InvalidAccessError' }))
    expect(lastMockInstance.close).toHaveBeenCalledTimes(2)
    await expect(socket.closed).resolves.toMatchObject({ code: 1000, kind: 'closed', reason: '' })
    expect(lastMockInstance.close).toHaveBeenCalledTimes(2)
  })

  test('should settle error after both native close calls throw without a third attempt', async () => {
    const firstFailure = new Error('first close failed')
    const fallbackFailure = new Error('fallback close failed')
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ closeErrors: [firstFailure, fallbackFailure] }))
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket())
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    const nativeSocket = lastMockInstance

    expect(() => socket.close(3000, 'owner close')).toThrow(firstFailure)
    await expect(socket.closed).resolves.toMatchObject({ cause: firstFailure, kind: 'error' })
    expect(socket.state).toBe('error')
    expect(nativeSocket.close).toHaveBeenCalledTimes(2)
    expect(() => socket.close(3001, 'again')).not.toThrow()
    expect(nativeSocket.close).toHaveBeenCalledTimes(2)
    expect(() => socket.close(200, 'invalid after terminal')).toThrow(expect.objectContaining({ name: 'InvalidAccessError' }))
    expect(nativeSocket.close).toHaveBeenCalledTimes(2)

    nativeSocket.triggerClose({ code: 1000, reason: 'late physical close', wasClean: true })
    expect(socket.bufferedAmount).toBe(0)
    expect(nativeSocket.close).toHaveBeenCalledTimes(2)
  })

  test.each([1000, 3000, 4999])('should accept close code %s', async (code) => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket())
    if (!socket) {
      throw new Error('Expected socket')
    }

    expect(() => socket.close(code, 'accepted')).not.toThrow()
    await expect(socket.closed).resolves.toMatchObject({ code, kind: 'closed', reason: 'accepted' })
  })

  test('should accept a 123-byte UTF-8 close reason', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket())
    if (!socket) {
      throw new Error('Expected socket')
    }
    const reason = `${'a'.repeat(120)}猫`

    expect(() => socket.close(1000, reason)).not.toThrow()
    await expect(socket.closed).resolves.toMatchObject({ kind: 'closed', reason })
  })

  test('should expose a single-consumer receive iterable and reject sends after terminal', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 1,
      incoming: {},
      outgoing: { message: struct.object({ text: struct.string() }) },
      path: '/ws/test',
    })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket())
    if (!socket) {
      throw new Error('Expected socket')
    }

    socket.receive[Symbol.asyncIterator]()
    expect(() => socket.receive[Symbol.asyncIterator]()).toThrow(new TypeError('AsyncQueue supports one consumer'))
    socket.close(1000, 'done')
    await socket.closed
    expect(() => socket.send({ type: 'message', text: 'late' })).toThrow(expect.objectContaining({ name: 'InvalidStateError' }))
  })

  test('should not send on the captured open socket when outgoing serialization aborts the session', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const controller = new AbortController()
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 1,
      incoming: {},
      outgoing: { message: struct.object({ text: struct.string() }) },
      path: '/ws/test',
    })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), { signal: controller.signal })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    const nativeSocket = lastMockInstance
    const message = {
      get text() {
        controller.abort(ERR_ABORTED)
        return 'late'
      },
      type: 'message' as const,
    }

    expect(() => socket.send(message)).toThrow(expect.objectContaining({ name: 'InvalidStateError' }))

    await expect(socket.closed).resolves.toMatchObject({ cause: ERR_ABORTED, kind: 'aborted' })
    expect(socket.state).toBe('aborted')
    expect(nativeSocket.send).not.toHaveBeenCalled()
  })

  test('should reject sends while manual close is pending before serializing or enqueueing', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ closeEventDelayMs: 30 }))
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 1,
      maxOutgoingQueueSize: 1,
      incoming: {},
      outgoing: { message: struct.object({ text: struct.string() }) },
      path: '/ws/test',
    })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket())
    if (!socket) {
      throw new Error('Expected socket')
    }

    socket.close(1000, 'done')
    expect(() => socket.send({ text: 'late', type: 'message' })).toThrow(expect.objectContaining({ name: 'InvalidStateError' }))
    await socket.closed
  })

  test('should reject sends after remote close before its reconnect predicate settles', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 1,
      maxOutgoingQueueSize: 1,
      incoming: {},
      outgoing: { message: struct.object({ text: struct.string() }) },
      path: '/ws/test',
    })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      reconnect: { attempts: 1, delayMs: 0, shouldReconnect: () => false },
    })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }

    lastMockInstance.triggerClose({ code: 1012, reason: 'restart', wasClean: true })
    expect(() => socket.send({ text: 'late', type: 'message' })).toThrow(expect.objectContaining({ name: 'InvalidStateError' }))
    await expect(socket.closed).resolves.toMatchObject({ kind: 'closed' })
  })

  test('should flush a reconnect frame before an open observer can send', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 1,
      maxOutgoingQueueSize: 1,
      incoming: {},
      outgoing: { message: struct.object({ text: struct.string() }) },
      path: '/ws/test',
    })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      reconnect: { attempts: 1, delayMs: 30 },
    })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    let queued = false
    socket.onStateChange((state) => {
      if (state === 'reconnecting' && !queued) {
        queued = true
        socket.send({ text: 'queued first', type: 'message' })
      }
      if (state === 'open' && socket.connection.generation === 2) {
        socket.send({ text: 'observer second', type: 'message' })
      }
    })

    lastMockInstance.triggerClose({ code: 1012, reason: 'restart', wasClean: true })
    await vi.waitFor(() => expect(socket.connection.generation).toBe(2))
    const replacement = lastMockInstance
    if (!replacement) {
      throw new Error('Expected replacement socket')
    }

    expect(queued).toBe(true)
    expect(replacement.send).toHaveBeenNthCalledWith(1, JSON.stringify({ type: 'message', text: 'queued first' }))
    expect(replacement.send).toHaveBeenNthCalledWith(2, JSON.stringify({ type: 'message', text: 'observer second' }))
    await Promise.resolve()
    expect(replacement.send).toHaveBeenCalledTimes(2)
    socket.close(1000, 'done')
    await socket.closed
  })

  test.each(['abort', 'close'] as const)(
    'should not publish replacement open after native flush synchronously triggers %s',
    async (action) => {
      const controller = new AbortController()
      let exposedSocket: SocketAwaitResult<unknown, unknown>[1]
      vi.stubGlobal(
        'WebSocket',
        createMockWebSocketClass({
          onSend() {
            if (mockInstances.length !== 2) {
              return
            }
            if (action === 'abort') {
              controller.abort(ERR_ABORTED)
            } else {
              exposedSocket?.close(1000, 'flush owner close')
            }
          },
        }),
      )
      const useSocket = defineWebSocket({
        maxIncomingQueueSize: 1,
        maxOutgoingQueueSize: 1,
        incoming: {},
        outgoing: { message: struct.object({ text: struct.string() }) },
        path: '/ws/test',
      })
      const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
        reconnect: { attempts: 1, delayMs: 0 },
        signal: controller.signal,
      })
      if (!socket || !lastMockInstance) {
        throw new Error('Expected socket')
      }
      exposedSocket = socket
      const replacementStates: string[] = []
      socket.onStateChange((state) => {
        if (socket.connection.generation === 2) {
          replacementStates.push(state)
        }
        if (state === 'reconnecting') {
          socket.send({ text: 'queued', type: 'message' })
        }
      })

      lastMockInstance.triggerClose({ code: 1012, reason: 'restart', wasClean: true })

      await expect(socket.closed).resolves.toMatchObject(
        action === 'abort' ? { cause: ERR_ABORTED, kind: 'aborted' } : { code: 1000, kind: 'closed', reason: 'flush owner close' },
      )
      expect(replacementStates).not.toContain('open')
      expect(socket.state).toBe(action === 'abort' ? 'aborted' : 'closed')
      expect(mockInstances).toHaveLength(2)
      expect(mockInstances[1]?.send).toHaveBeenCalledTimes(1)
    },
  )

  test('should not enqueue a reconnect frame when outgoing serialization aborts the session', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const controller = new AbortController()
    const reconnecting = createDeferred<void>()
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 1,
      maxOutgoingQueueSize: 1,
      incoming: {},
      outgoing: { message: struct.object({ text: struct.string() }) },
      path: '/ws/test',
    })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      reconnect: { attempts: 1, delayMs: 1_000 },
      signal: controller.signal,
    })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    socket.onStateChange((state) => {
      if (state === 'reconnecting') {
        reconnecting.resolve(undefined)
      }
    })

    lastMockInstance.triggerClose({ code: 1012, reason: 'restart', wasClean: true })
    await reconnecting.promise
    const message = {
      get text() {
        controller.abort(ERR_ABORTED)
        return 'late'
      },
      type: 'message' as const,
    }

    expect(() => socket.send(message)).toThrow(expect.objectContaining({ name: 'InvalidStateError' }))

    await expect(socket.closed).resolves.toMatchObject({ cause: ERR_ABORTED, kind: 'aborted' })
    expect(socket.state).toBe('aborted')
    expect(mockInstances).toHaveLength(1)
    expect(mockInstances[0]?.send).not.toHaveBeenCalled()
  })

  test('should not deliver a stale reconnecting state after a listener closes reentrantly', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      reconnect: { attempts: 1, delayMs: 30 },
    })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    const laterListenerStates: string[] = []
    socket.onStateChange((state) => {
      if (state === 'reconnecting') socket.close(1000, 'owner stopped')
    })
    socket.onStateChange((state) => laterListenerStates.push(state))

    lastMockInstance.triggerClose({ code: 1012, reason: 'restart', wasClean: true })

    await expect(socket.closed).resolves.toMatchObject({ kind: 'closed' })
    expect(laterListenerStates).toEqual(['closing', 'closed'])
    expect(socket.state).toBe('closed')
    expect(mockInstances).toHaveLength(1)
  })

  test('should terminate after a reconnect beforeConnect failure and reject pending receive', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const attempts: number[] = []
    const hookFailure = new Error('refresh failed')
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      beforeConnect({ attempt }: { attempt: number }) {
        attempts.push(attempt)
        if (attempt === 1) {
          throw hookFailure
        }
      },
      reconnect: { attempts: 1, delayMs: 0 },
    })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    const pending = socket.receive[Symbol.asyncIterator]().next()

    lastMockInstance.triggerClose({ code: 1012, reason: 'restart', wasClean: true })

    await expect(socket.closed).resolves.toMatchObject({ kind: 'error' })
    await expect(pending).rejects.toMatchObject({ kind: 'transport' })
    expect(socket.state).toBe('error')
    expect(attempts).toEqual([0, 1])
    expect(mockInstances).toHaveLength(1)
  })

  test('should terminate when reconnect policy throws and reject pending receive', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const policyFailure = new Error('policy failed')
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      reconnect: {
        attempts: 1,
        delayMs: 0,
        shouldReconnect() {
          throw policyFailure
        },
      },
    })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    const pending = socket.receive[Symbol.asyncIterator]().next()

    lastMockInstance.triggerClose({ code: 1012, reason: 'restart', wasClean: true })

    await expect(socket.closed).resolves.toMatchObject({ cause: policyFailure, kind: 'error' })
    await expect(pending).rejects.toBe(policyFailure)
    expect(socket.state).toBe('error')
  })

  test('should reject startup when reconnect policy throws after a pre-open close', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ autoOpen: false }))
    const policyFailure = new Error('pre-open policy failed')
    const predicate = vi.fn(() => {
      throw policyFailure
    })
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const executePromise = run(createClient(withEndpoint('http://localhost')), useSocket(), {
      reconnect: { attempts: 1, delayMs: 0, shouldReconnect: predicate },
    })

    await vi.waitFor(() => expect(lastMockInstance).toBeDefined())
    lastMockInstance?.triggerClose({ code: 1006, reason: 'closed before open', wasClean: false })

    const [error, socket, connection] = await executePromise
    expect(error).toMatchObject({ cause: policyFailure, code: 'NETWORK_ERROR', kind: 'transport' })
    expect(socket).toBeUndefined()
    expect(connection).toMatchObject({ generation: 0 })
    expect(predicate).toHaveBeenCalledTimes(1)
    expect(mockInstances).toHaveLength(1)
  })

  test('should fail receive with AbortError when a post-open reconnect policy throws undefined', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      reconnect: {
        attempts: 1,
        delayMs: 0,
        shouldReconnect() {
          throw undefined
        },
      },
    })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    const pendingReceive = socket.receive[Symbol.asyncIterator]()
      .next()
      .catch((error: unknown) => error)

    lastMockInstance.triggerClose({ code: 1012, reason: 'restart', wasClean: true })

    await expect(socket.closed).resolves.toEqual({
      cause: undefined,
      code: 1012,
      kind: 'error',
      reason: 'restart',
      wasClean: true,
    })
    await expect(pendingReceive).resolves.toMatchObject({ name: 'AbortError' })
    expect(socket.state).toBe('error')
  })

  test.each([
    createDefinitionError('REQUEST_VALIDATION_FAILED', new Error('invalid reconnect policy')),
    createHttpStatusError(503, 'reconnect policy unavailable', makeResponse({ status: 503 })),
    createTransportError(new Error('reconnect policy offline')),
  ])('should preserve a $kind RequestError thrown by the reconnect policy', async (policyFailure) => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const useSocket = defineWebSocket({ maxIncomingQueueSize: 1, incoming: {}, path: '/ws/test' })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      reconnect: {
        attempts: 1,
        delayMs: 0,
        shouldReconnect() {
          throw policyFailure
        },
      },
    })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    const pending = socket.receive[Symbol.asyncIterator]().next()

    lastMockInstance.triggerClose({ code: 1012, reason: 'restart', wasClean: true })

    await expect(socket.closed).resolves.toMatchObject({ cause: policyFailure, kind: 'error' })
    await expect(pending).rejects.toBe(policyFailure)
    expect(socket.state).toBe('error')
  })

  test('should not replay a frame after a physical reconnect', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 1,
      incoming: {},
      outgoing: { mutation: struct.object({ id: struct.number() }) },
      path: '/ws/test',
    })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      reconnect: { attempts: 1, delayMs: 0 },
    })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }
    const firstSocket = lastMockInstance

    socket.send({ id: 1, type: 'mutation' })
    firstSocket.triggerClose({ code: 1012, reason: 'restart', wasClean: true })
    await vi.waitFor(() => expect(socket.connection.generation).toBe(2))
    const secondSocket = lastMockInstance
    if (!secondSocket || secondSocket === firstSocket) {
      throw new Error('Expected a replacement socket')
    }

    expect(firstSocket.send).toHaveBeenCalledTimes(1)
    expect(secondSocket.send).not.toHaveBeenCalled()
    socket.send({ id: 2, type: 'mutation' })
    expect(secondSocket.send).toHaveBeenCalledTimes(1)
    socket.close(1000, 'done')
    await socket.closed
  })

  test('should disable outgoing buffering by default during reconnect preparation', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass())
    const attempts: number[] = []
    const useSocket = defineWebSocket({
      maxIncomingQueueSize: 1,
      incoming: {},
      outgoing: { message: struct.object({ text: struct.string() }) },
      path: '/ws/test',
    })
    const [, socket] = await run(createClient(withEndpoint('http://localhost')), useSocket(), {
      beforeConnect({ attempt }: { attempt: number }) {
        attempts.push(attempt)
        if (attempt === 1) {
          return new Promise<void>(() => undefined)
        }
      },
      reconnect: { attempts: 1, delayMs: 0 },
    })
    if (!socket || !lastMockInstance) {
      throw new Error('Expected socket')
    }

    lastMockInstance.triggerClose({ code: 1012, reason: 'restart', wasClean: true })
    await vi.waitFor(() => expect(attempts).toEqual([0, 1]))

    expect(socket.state).toBe('reconnecting')
    expect(() => socket.send({ text: 'not buffered', type: 'message' })).toThrow('WebSocket outgoing queue is disabled')
    expect(socket.state).toBe('reconnecting')

    socket.close(1000, 'owner stopped reconnect')
    await expect(socket.closed).resolves.toMatchObject({ code: 1000, kind: 'closed', reason: 'owner stopped reconnect' })
    expect(mockInstances).toHaveLength(1)
  })
})

import { afterEach, describe, expect, test, vi } from 'vitest'
import { createClient, withEndpoint, withWebSocketHandle, withWebSocketReconnect } from '../client'
import { ERR_ABORTED } from '../error'
import { struct } from '../struct'
import { defineWebSocket } from './index'

let lastMockInstance: MockWebSocketInstance | undefined

interface MockWebSocketInstance {
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
}

function createMockWebSocketClass(
  options: { autoOpen?: boolean; autoCloseDelay?: number; sendError?: Error; throwOnConstruct?: Error } = {},
) {
  const { autoOpen = true, autoCloseDelay = -1, sendError, throwOnConstruct } = options

  return class MockWebSocket {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3

    readyState: number
    url: string
    protocol: string
    extensions: string
    close: MockWebSocketInstance['close']
    send: MockWebSocketInstance['send']
    addEventListener: MockWebSocketInstance['addEventListener']
    removeEventListener: MockWebSocketInstance['removeEventListener']
    triggerOpen: MockWebSocketInstance['triggerOpen']
    triggerClose: MockWebSocketInstance['triggerClose']
    triggerError: MockWebSocketInstance['triggerError']

    private listeners: Record<string, Array<(event: unknown) => void>>

    constructor(url: string, protocols?: string | string[]) {
      if (throwOnConstruct) {
        throw throwOnConstruct
      }

      this.readyState = MockWebSocket.CONNECTING
      this.url = url
      this.protocol = Array.isArray(protocols) ? (protocols[0] ?? '') : (protocols ?? '')
      this.extensions = ''
      this.binaryType = 'blob'
      this.listeners = {}
      this.close = vi.fn((code?: number, reason?: string) => {
        this.readyState = MockWebSocket.CLOSING
        setTimeout(() => {
          this.readyState = MockWebSocket.CLOSED
          this.listeners['close']?.forEach((fn) => {
            fn({ code: code ?? 1000, reason: reason ?? '', wasClean: true })
          })
        }, 0)
      })
      this.send = vi.fn(() => {
        if (sendError) {
          throw sendError
        }
      })
      this.addEventListener = (type: string, fn: (event: unknown) => void) => {
        this.listeners[type] = this.listeners[type] || []
        this.listeners[type].push(fn)
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

      lastMockInstance = this

      if (autoOpen) {
        setTimeout(() => this.triggerOpen(), 0)
      }
      if (autoCloseDelay >= 0) {
        setTimeout(() => this.triggerClose({ code: 1000, reason: 'done', wasClean: true }), autoCloseDelay)
      }
    }
  }
}

describe('web socket runtime environment edge cases', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    lastMockInstance = undefined
  })

  test('should return transport error when WebSocket constructor throws', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ throwOnConstruct: new Error('connection refused') }))

    const useSocket = defineWebSocket({
      incoming: {},
      path: '/ws/test',
    })

    const [error, socket, connection] = await useSocket().with({
      client: createClient(withEndpoint('http://localhost')),
    })

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
      incoming: {},
      path: '/ws/test',
    })

    const [error, socket, connection] = await useSocket().with({
      client: createClient(withEndpoint('http://localhost')),
    })

    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(error?.kind).toBe('transport')
    expect(error?.message).toBe('Network error')
  })

  test('should finish startup with aborted transport error when aborted before open', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ autoOpen: false }))

    const controller = new AbortController()
    const useSocket = defineWebSocket({
      incoming: {},
      path: '/ws/test',
    })

    const ref = useSocket().with({
      abort: controller.signal,
      client: createClient(withEndpoint('http://localhost')),
    })

    setTimeout(() => controller.abort(ERR_ABORTED), 10)

    const [error, socket, connection] = await ref

    expect(socket).toBeUndefined()
    expect(connection?.url).toBe('ws://localhost/ws/test')
    expect(error?.kind).toBe('transport')
    expect(error?.code).toBe('ABORTED')
  })

  test('should return transport error when WebSocket is not supported', async () => {
    const originalWebSocket = globalThis.WebSocket
    vi.stubGlobal('WebSocket', undefined)

    const useSocket = defineWebSocket({
      incoming: {},
      path: '/ws/test',
    })

    const [error, socket, connection] = await useSocket().with({
      client: createClient(withEndpoint('http://localhost')),
    })

    expect(socket).toBeUndefined()
    expect(connection).toBeUndefined()
    expect(error?.kind).toBe('transport')

    vi.stubGlobal('WebSocket', originalWebSocket)
  })

  test('should set duplicate open state only once', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ autoCloseDelay: 50 }))

    const states: string[] = []
    const useSocket = defineWebSocket({
      incoming: {},
      path: '/ws/test',
    })

    const ref = useSocket().with({
      client: createClient(withEndpoint('http://localhost')),
    })

    ref.onStateChange((state) => {
      states.push(state)
    })

    const [, socket] = await ref

    if (!socket) {
      throw new Error('Expected socket')
    }

    await new Promise((resolve) => setTimeout(resolve, 10))

    lastMockInstance?.triggerOpen()
    lastMockInstance?.triggerOpen()

    await expect(socket.closed).resolves.toMatchObject({ code: 1000 })
    expect(states.filter((state) => state === 'open')).toHaveLength(1)
  })

  test('should emit runtime error when send throws during queued flush', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ sendError: new Error('send failed') }))

    const useSocket = defineWebSocket({
      incoming: {},
      outgoing: {
        msg: struct.object({ text: struct.string() }),
      },
      path: '/ws/test',
    })

    const [error, socket] = await useSocket().with({
      client: createClient(
        withEndpoint('http://localhost'),
        withWebSocketHandle(globalThis.WebSocket),
        withWebSocketReconnect({ attempts: 1, delayMs: 50 }),
      ),
    })

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket')
    }

    let runtimeError: unknown
    socket.onRuntimeError((err) => {
      runtimeError = err
    })

    await new Promise((resolve) => setTimeout(resolve, 10))
    lastMockInstance?.triggerClose({ code: 1000, reason: '', wasClean: true })
    await new Promise((resolve) => setTimeout(resolve, 10))

    socket.send({ type: 'msg', text: 'queued' })

    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(runtimeError).toBeDefined()
  })

  test('should set binaryType to arraybuffer on socket creation', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ autoCloseDelay: 50 }))

    const useSocket = defineWebSocket({
      incoming: {},
      path: '/ws/test',
    })

    const [, socket] = await useSocket().with({
      client: createClient(withEndpoint('http://localhost')),
    })

    expect(socket).toBeDefined()
    expect(lastMockInstance?.binaryType).toBe('arraybuffer')
  })

  test('should surface runtime cause on error event before close', async () => {
    vi.stubGlobal('WebSocket', createMockWebSocketClass({ autoCloseDelay: 50 }))

    const useSocket = defineWebSocket({
      incoming: {},
      path: '/ws/test',
    })

    const [error, socket] = await useSocket().with({
      client: createClient(withEndpoint('http://localhost')),
    })

    expect(error).toBeNull()
    if (!socket) {
      throw new Error('Expected socket')
    }

    await new Promise((resolve) => setTimeout(resolve, 10))
    lastMockInstance?.triggerError()

    const closeInfo = await socket.closed
    expect(closeInfo.code).toBe(1000)
  })
})

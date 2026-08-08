// Schedule server events in a microtask so Defjs can attach WebSocket listeners before the fixture opens.

export class FixtureSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly url: string
  binaryType: BinaryType = 'blob'
  extensions = ''
  protocol = ''
  readyState = FixtureSocket.CONNECTING

  constructor(url: string | URL) {
    super()
    this.url = String(url)
  }

  open(): void {
    this.readyState = FixtureSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }

  message(value: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) }))
  }

  send(_data: string | ArrayBufferLike | Blob | ArrayBufferView): void {}

  close(code = 1000, reason = ''): void {
    if (this.readyState >= FixtureSocket.CLOSING) return
    this.readyState = FixtureSocket.CLOSING
    queueMicrotask(() => {
      this.readyState = FixtureSocket.CLOSED
      this.dispatchEvent(new CloseEvent('close', { code, reason, wasClean: true }))
    })
  }
}

export function createWebSocketFixture() {
  const connected = Promise.withResolvers<FixtureSocket>()

  class WebSocketFixture extends FixtureSocket {
    constructor(url: string | URL) {
      super(url)
      connected.resolve(this)
    }
  }

  return { connected: connected.promise, WebSocket: WebSocketFixture as unknown as typeof WebSocket }
}

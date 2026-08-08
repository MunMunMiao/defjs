// Keep close delivery asynchronous so the session owner can await the real terminal event.

export class OwnedLifecycleFixtureSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly url: string
  binaryType = 'blob'
  extensions = ''
  protocol = ''
  readyState = OwnedLifecycleFixtureSocket.CONNECTING

  constructor(url: string | URL) {
    super()
    this.url = String(url)
  }

  open(): void {
    this.readyState = OwnedLifecycleFixtureSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }

  message(value: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) }))
  }

  close(code?: number, reason?: string): void {
    if (this.readyState >= OwnedLifecycleFixtureSocket.CLOSING) return
    this.readyState = OwnedLifecycleFixtureSocket.CLOSING
    queueMicrotask(() => {
      this.readyState = OwnedLifecycleFixtureSocket.CLOSED
      this.dispatchEvent(new CloseEvent('close', { code: code ?? 1000, reason: reason ?? '', wasClean: true }))
    })
  }
}

export function createOwnedLifecycleFixture(script: (socket: OwnedLifecycleFixtureSocket) => void): typeof WebSocket {
  class FixtureWebSocket extends OwnedLifecycleFixtureSocket {
    constructor(url: string | URL) {
      super(url)
      queueMicrotask(() => script(this))
    }
  }

  return FixtureWebSocket as unknown as typeof WebSocket
}

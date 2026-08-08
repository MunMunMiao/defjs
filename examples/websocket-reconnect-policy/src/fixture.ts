// Create a fresh socket for each reconnect attempt and let the script choose its terminal close.

export interface ReconnectFixtureContext {
  readonly attempt: number
  readonly socket: ReconnectFixtureSocket
}

export class ReconnectFixtureSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly url: string
  binaryType = 'blob'
  extensions = ''
  protocol = ''
  readyState = ReconnectFixtureSocket.CONNECTING

  constructor(url: string | URL) {
    super()
    this.url = String(url)
  }

  open(): void {
    this.readyState = ReconnectFixtureSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }

  message(value: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) }))
  }

  close(code?: number, reason?: string): void {
    if (this.readyState >= ReconnectFixtureSocket.CLOSING) return
    this.readyState = ReconnectFixtureSocket.CLOSING
    queueMicrotask(() => this.serverClose(code ?? 1000, reason ?? '', true))
  }

  serverClose(code: number, reason: string, wasClean: boolean): void {
    if (this.readyState === ReconnectFixtureSocket.CLOSED) return
    this.readyState = ReconnectFixtureSocket.CLOSED
    this.dispatchEvent(new CloseEvent('close', { code, reason, wasClean }))
  }
}

export function createReconnectFixture(script: (context: ReconnectFixtureContext) => void) {
  let attempts = 0

  class FixtureWebSocket extends ReconnectFixtureSocket {
    constructor(url: string | URL) {
      super(url)
      attempts++
      const context = { attempt: attempts, socket: this }
      queueMicrotask(() => script(context))
    }
  }

  return {
    get attempts() {
      return attempts
    },
    WebSocket: FixtureWebSocket as unknown as typeof WebSocket,
  }
}

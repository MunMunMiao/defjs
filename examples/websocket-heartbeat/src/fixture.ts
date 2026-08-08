// Forward sent heartbeat frames to the script and deliver server events only after listeners are attached.

export class HeartbeatFixtureSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly url: string
  binaryType = 'blob'
  extensions = ''
  onSend?: (text: string) => void
  protocol = ''
  readyState = HeartbeatFixtureSocket.CONNECTING

  constructor(url: string | URL) {
    super()
    this.url = String(url)
  }

  open(): void {
    this.readyState = HeartbeatFixtureSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }

  message(value: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) }))
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.onSend?.(String(data))
  }

  close(code?: number, reason?: string): void {
    if (this.readyState >= HeartbeatFixtureSocket.CLOSING) return
    this.readyState = HeartbeatFixtureSocket.CLOSING
    queueMicrotask(() => this.serverClose(code ?? 1000, reason ?? '', true))
  }

  serverClose(code: number, reason: string, wasClean: boolean): void {
    if (this.readyState === HeartbeatFixtureSocket.CLOSED) return
    this.readyState = HeartbeatFixtureSocket.CLOSED
    this.dispatchEvent(new CloseEvent('close', { code, reason, wasClean }))
  }
}

export function createHeartbeatFixture(script: (socket: HeartbeatFixtureSocket) => void): typeof WebSocket {
  class FixtureWebSocket extends HeartbeatFixtureSocket {
    constructor(url: string | URL) {
      super(url)
      queueMicrotask(() => script(this))
    }
  }

  return FixtureWebSocket as unknown as typeof WebSocket
}

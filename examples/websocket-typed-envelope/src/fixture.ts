// Forward serialized sends to the script and deliver typed server envelopes after listener installation.

export class EnvelopeFixtureSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly url: string
  binaryType = 'blob'
  extensions = ''
  onSend?: (text: string) => void
  protocol = ''
  readyState = EnvelopeFixtureSocket.CONNECTING

  constructor(url: string | URL) {
    super()
    this.url = String(url)
  }

  open(): void {
    this.readyState = EnvelopeFixtureSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }

  message(value: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) }))
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.onSend?.(String(data))
  }

  close(code?: number, reason?: string): void {
    if (this.readyState >= EnvelopeFixtureSocket.CLOSING) return
    this.readyState = EnvelopeFixtureSocket.CLOSING
    queueMicrotask(() => {
      this.readyState = EnvelopeFixtureSocket.CLOSED
      this.dispatchEvent(new CloseEvent('close', { code: code ?? 1000, reason: reason ?? '', wasClean: true }))
    })
  }
}

export function createEnvelopeFixture(script: (socket: EnvelopeFixtureSocket) => void): typeof WebSocket {
  class FixtureWebSocket extends EnvelopeFixtureSocket {
    constructor(url: string | URL) {
      super(url)
      queueMicrotask(() => script(this))
    }
  }

  return FixtureWebSocket as unknown as typeof WebSocket
}

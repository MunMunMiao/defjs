// Expose offered protocols and open with the fixture-selected protocol after listener installation.

class ProtocolFixtureSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly url: string
  binaryType = 'blob'
  extensions = ''
  protocol = ''
  readyState = ProtocolFixtureSocket.CONNECTING

  constructor(url: string | URL) {
    super()
    this.url = String(url)
  }

  open(protocol: string): void {
    this.protocol = protocol
    this.readyState = ProtocolFixtureSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }

  close(code?: number, reason?: string): void {
    if (this.readyState >= ProtocolFixtureSocket.CLOSING) return
    this.readyState = ProtocolFixtureSocket.CLOSING
    queueMicrotask(() => {
      this.readyState = ProtocolFixtureSocket.CLOSED
      this.dispatchEvent(new CloseEvent('close', { code: code ?? 1000, reason: reason ?? '', wasClean: true }))
    })
  }
}

export function createProtocolFixture(selectedProtocol: string) {
  const offeredProtocols: string[] = []

  class FixtureWebSocket extends ProtocolFixtureSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url)
      offeredProtocols.push(...(typeof protocols === 'string' ? [protocols] : (protocols ?? [])))
      queueMicrotask(() => this.open(selectedProtocol))
    }
  }

  return { offeredProtocols, WebSocket: FixtureWebSocket as unknown as typeof WebSocket }
}

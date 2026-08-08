// Create a fresh socket per physical attempt and expose the attempt number to the preparation script.

export interface PreparationFixtureContext {
  readonly attempt: number
  readonly socket: PreparationFixtureSocket
}

export class PreparationFixtureSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly url: string
  binaryType = 'blob'
  extensions = ''
  protocol = ''
  readyState = PreparationFixtureSocket.CONNECTING

  constructor(url: string | URL) {
    super()
    this.url = String(url)
  }

  open(): void {
    this.readyState = PreparationFixtureSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }

  message(value: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) }))
  }

  close(code?: number, reason?: string): void {
    if (this.readyState >= PreparationFixtureSocket.CLOSING) return
    this.readyState = PreparationFixtureSocket.CLOSING
    queueMicrotask(() => this.serverClose(code ?? 1000, reason ?? '', true))
  }

  serverClose(code: number, reason: string, wasClean: boolean): void {
    if (this.readyState === PreparationFixtureSocket.CLOSED) return
    this.readyState = PreparationFixtureSocket.CLOSED
    this.dispatchEvent(new CloseEvent('close', { code, reason, wasClean }))
  }
}

export function createPreparationFixture(script: (context: PreparationFixtureContext) => void): typeof WebSocket {
  let attempts = 0

  class FixtureWebSocket extends PreparationFixtureSocket {
    constructor(url: string | URL) {
      super(url)
      attempts += 1
      queueMicrotask(() => script({ attempt: attempts, socket: this }))
    }
  }

  return FixtureWebSocket as unknown as typeof WebSocket
}

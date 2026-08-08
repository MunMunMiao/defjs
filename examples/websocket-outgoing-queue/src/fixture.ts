// Record each physical attempt and sent frame so reconnect queue order remains observable.

export interface QueueFixtureContext {
  readonly attempt: number
  readonly socket: QueueFixtureSocket
}

export class QueueFixtureSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly url: string
  binaryType = 'blob'
  extensions = ''
  onSend?: (text: string) => void
  protocol = ''
  readyState = QueueFixtureSocket.CONNECTING

  constructor(url: string | URL) {
    super()
    this.url = String(url)
  }

  open(): void {
    this.readyState = QueueFixtureSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.onSend?.(String(data))
  }

  close(code?: number, reason?: string): void {
    if (this.readyState >= QueueFixtureSocket.CLOSING) return
    this.readyState = QueueFixtureSocket.CLOSING
    queueMicrotask(() => this.serverClose(code ?? 1000, reason ?? '', true))
  }

  serverClose(code: number, reason: string, wasClean: boolean): void {
    if (this.readyState === QueueFixtureSocket.CLOSED) return
    this.readyState = QueueFixtureSocket.CLOSED
    this.dispatchEvent(new CloseEvent('close', { code, reason, wasClean }))
  }
}

export function createQueueFixture(script: (context: QueueFixtureContext) => void) {
  const connections: QueueFixtureContext[] = []
  const waiters: Array<() => void> = []

  class FixtureWebSocket extends QueueFixtureSocket {
    constructor(url: string | URL) {
      super(url)
      const context = { attempt: connections.length + 1, socket: this }
      connections.push(context)
      for (const resolve of waiters.splice(0)) resolve()
      queueMicrotask(() => script(context))
    }
  }

  async function connection(count: number): Promise<QueueFixtureContext> {
    while (connections.length < count) await new Promise<void>((resolve) => waiters.push(resolve))
    const context = connections[count - 1]
    if (!context) throw new Error('Fixture connection is missing')
    return context
  }

  return { connection, WebSocket: FixtureWebSocket as unknown as typeof WebSocket }
}

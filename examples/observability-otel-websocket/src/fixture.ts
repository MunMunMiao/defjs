// A dedicated socket keeps the example offline while preserving browser event order.
export function createInventoryWebSocketFixture() {
  let connectionUrl = ''

  class FixtureWebSocket extends EventTarget {
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSING = 2
    static readonly CLOSED = 3

    readonly url: string
    binaryType: 'arraybuffer' | 'blob' = 'blob'
    extensions = ''
    protocol = ''
    readyState = FixtureWebSocket.CONNECTING

    constructor(url: string | URL) {
      super()
      this.url = String(url)
      connectionUrl = this.url
      queueMicrotask(() => {
        this.readyState = FixtureWebSocket.OPEN
        this.dispatchEvent(new Event('open'))
        queueMicrotask(() => {
          const data = JSON.stringify({ available: 18, sku: 'SKU-204', type: 'stock' })
          this.dispatchEvent(new MessageEvent('message', { data }))
        })
      })
    }

    close(code = 1000, reason = ''): void {
      if (this.readyState >= FixtureWebSocket.CLOSING) return
      this.readyState = FixtureWebSocket.CLOSING
      queueMicrotask(() => {
        this.readyState = FixtureWebSocket.CLOSED
        this.dispatchEvent(new CloseEvent('close', { code, reason, wasClean: true }))
      })
    }
  }

  return {
    get connectionUrl() {
      return connectionUrl
    },
    WebSocket: FixtureWebSocket as unknown as typeof WebSocket,
  }
}

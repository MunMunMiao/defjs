import {
  createClient,
  defineWebSocket,
  struct,
  type WebSocketIncomingData,
  type WebSocketSession,
  withEndpoint,
  withWebSocketHandle,
} from '@defjs/core'
import { ClientProvider, useClient } from '@defjs/react'
import { createElement, useEffect } from 'react'
import { createWebSocketFixture } from './fixture'
import { mountReactFixture } from './renderer'

// Step 1: Type shipment-status messages before effect callbacks can observe them.
const shipmentStatusMessages = {
  'shipment-status': struct.object({ shipmentId: struct.string(), status: struct.string() }),
}
export type ShipmentStatus = WebSocketIncomingData<typeof shipmentStatusMessages>
type ShipmentSession = WebSocketSession<ShipmentStatus>
export const shipmentStatusSocket = defineWebSocket({
  maxIncomingQueueSize: 16,
  path: '/v1/shipments/ship-204/status',
  incoming: shipmentStatusMessages,
})

// Step 2: Make one React effect own startup, receive callbacks, and awaited WebSocket closure.
export function ShipmentStatusEffect({
  onClosed,
  onError,
  onStatus,
}: {
  onClosed: () => void
  onError: (error: unknown) => void
  onStatus: (status: ShipmentStatus) => void
}) {
  const client = useClient()

  useEffect(() => {
    const owner = new AbortController()
    let disposed = false
    let session: ShipmentSession | undefined

    async function receiveStatuses(): Promise<void> {
      const [error, opened] = await client.execute(shipmentStatusSocket(), { signal: owner.signal })
      if (error) throw error
      session = opened
      try {
        for await (const status of opened.receive) {
          if (!disposed) onStatus(status)
        }
      } finally {
        opened.close(1000, 'shipment status receiver stopped')
        await opened.closed
      }
    }

    void receiveStatuses()
      .catch((error: unknown) => {
        if (!disposed) onError(error)
      })
      .finally(onClosed)
    return () => {
      disposed = true
      session?.close(1000, 'shipment view closed')
      owner.abort()
    }
  }, [client, onClosed, onError, onStatus])

  return null
}

export async function main(): Promise<void> {
  // Step 3: Create a controllable socket and promises for status and closure.
  const fixture = createWebSocketFixture()
  const closed = Promise.withResolvers<void>()
  const status = Promise.withResolvers<ShipmentStatus>()
  const client = createClient(withEndpoint('https://operations.fixture.invalid'), withWebSocketHandle(fixture.WebSocket))

  // Step 4: Mount the effect, open the socket, and deliver one typed status.
  const renderer = await mountReactFixture(
    createElement(
      ClientProvider,
      { client },
      createElement(ShipmentStatusEffect, { onClosed: closed.resolve, onError: status.reject, onStatus: status.resolve }),
    ),
  )
  const socket = await fixture.connected
  try {
    socket.open()
    socket.message({ shipmentId: 'ship-204', status: 'loaded', type: 'shipment-status' })
    await status.promise
  } finally {
    // Step 5: Unmount the renderer and await WebSocket closure.
    await renderer.unmount()
    await closed.promise
  }

  // Step 6: Emit the status received while the effect was active.
  console.log(JSON.stringify(await status.promise))
}

if (import.meta.main) {
  await main()
}

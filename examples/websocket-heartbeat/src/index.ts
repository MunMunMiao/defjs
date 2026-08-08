import {
  createClient,
  defineWebSocket,
  struct,
  type Client,
  type WebSocketOutgoingData,
  withEndpoint,
  withWebSocketHandle,
} from '@defjs/core'
import { createHeartbeatFixture } from './fixture'

const MONITOR_ID = 'dock-monitor-9'

// Step 1: Correlate Struct-derived ping and pong envelopes to the active dock monitor.
const dockMonitorIncoming = { pong: struct.object({ monitorId: struct.string() }) }
const dockMonitorOutgoing = { ping: struct.object({ monitorId: struct.string() }) }
type DockMonitorPing = WebSocketOutgoingData<typeof dockMonitorOutgoing>
export const dockMonitor = defineWebSocket({
  path: '/v1/docks/dock-3/monitor',
  incoming: dockMonitorIncoming,
  outgoing: dockMonitorOutgoing,
})

// Step 2: Own heartbeat acknowledgement, runtime failure capture, and terminal session cleanup.
export async function monitorDock(client: Client, monitorId: string) {
  const [error, session] = await client.execute(dockMonitor(), {
    heartbeat: {
      intervalMs: 10,
      isAck: (message) => message.monitorId === monitorId,
      message: (): DockMonitorPing => ({ monitorId, type: 'ping' }),
      timeoutMs: 2,
    },
  })
  if (error) throw error

  let runtimeError: string | undefined
  const stopRuntimeErrors = session.onRuntimeError((cause) => {
    runtimeError = cause instanceof Error ? cause.message : String(cause)
  })
  try {
    const close = await session.closed
    return { closeCode: close.code, runtimeError }
  } finally {
    stopRuntimeErrors()
    session.close(1000, 'monitor complete')
    await session.closed
  }
}

export async function main(): Promise<void> {
  // Step 3: Create one pong-capable socket and one silent socket.
  let acknowledgedPings = 0
  const acknowledgedSocket = createHeartbeatFixture((socket) => {
    socket.onSend = (text) => {
      acknowledgedPings += 1
      const ping = JSON.parse(text) as { monitorId: string }
      if (acknowledgedPings === 1) socket.message({ monitorId: ping.monitorId, type: 'pong' })
      else queueMicrotask(() => socket.serverClose(1000, 'monitor acknowledged', true))
    }
    socket.open()
  })
  const silentSocket = createHeartbeatFixture((socket) => socket.open())

  // Step 4: Monitor the same dock through both heartbeat outcomes.
  const acknowledged = await monitorDock(
    createClient(withEndpoint('https://operations.invalid'), withWebSocketHandle(acknowledgedSocket)),
    MONITOR_ID,
  )
  const silent = await monitorDock(createClient(withEndpoint('https://operations.invalid'), withWebSocketHandle(silentSocket)), MONITOR_ID)

  // Step 5: Emit acknowledged ping count and the silent timeout result.
  console.log(JSON.stringify({ acknowledged: { ...acknowledged, pings: acknowledgedPings }, silent }))
}

if (import.meta.main) {
  await main()
}

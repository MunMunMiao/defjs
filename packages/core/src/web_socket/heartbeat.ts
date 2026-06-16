import type { FnReturn } from '../internal/utility_types'
import { serializeOutgoingWebSocketMessage } from './codec'
import type { SendQueue } from './queue'
import type { SocketSchemas, WebSocketHeartbeatConfig, WebSocketOutgoingData } from './web_socket'

export type HeartbeatRuntime<TIncoming> = {
  isAck?: (message: TIncoming) => boolean
  markAck(): void
  stop(): void
}

export type HeartbeatSession<TIncoming> = {
  currentSocket: WebSocket | undefined
  heartbeat: HeartbeatRuntime<TIncoming> | undefined
  lastRuntimeError: unknown
}

export function startHeartbeat<TIncoming, TOutgoing extends SocketSchemas | undefined>(
  socket: WebSocket,
  sessionController: HeartbeatSession<TIncoming>,
  config: WebSocketHeartbeatConfig<TIncoming, WebSocketOutgoingData<TOutgoing>> | undefined,
  outgoing: TOutgoing,
  sendQueue: SendQueue,
  onError: (error: unknown) => void,
): void {
  stopHeartbeat(sessionController)
  if (!config) {
    return
  }

  let ackTimer: FnReturn<typeof setTimeout> | undefined
  const interval = setInterval(() => {
    if (socket.readyState !== WebSocket.OPEN) {
      return
    }

    const nextMessage = resolveHeartbeatMessage(config.message)
    if (typeof nextMessage === 'undefined') {
      return
    }

    try {
      const serialized = serializeOutgoingWebSocketMessage(outgoing, nextMessage as WebSocketOutgoingData<TOutgoing>)
      socket.send(serialized)
    } catch (error) {
      onError(error)
      return
    }

    if (typeof config.timeoutMs === 'number' && config.timeoutMs > 0) {
      clearTimeout(ackTimer)
      ackTimer = setTimeout(() => {
        onError(new Error('WebSocket heartbeat timeout'))
        try {
          socket.close(4000, 'heartbeat timeout')
        } catch {
          sendQueue.clear()
        }
      }, config.timeoutMs)
    }
  }, config.intervalMs)

  sessionController.heartbeat = {
    isAck: config.isAck,
    markAck() {
      clearTimeout(ackTimer)
      ackTimer = undefined
    },
    stop() {
      clearInterval(interval)
      clearTimeout(ackTimer)
      ackTimer = undefined
    },
  }
}

export function stopHeartbeat<T>(sessionController: { heartbeat: HeartbeatRuntime<T> | undefined }): void {
  sessionController.heartbeat?.stop()
  sessionController.heartbeat = undefined
}

function resolveHeartbeatMessage<T>(message?: <R = T>() => R | unknown): T | undefined {
  if (!message) {
    return undefined
  }

  return message() as T
}

import type { WebSocketQueueOptions } from '../client/config'

export type WebSocketQueueConfig = WebSocketQueueOptions

export type SendQueue = {
  clear(): void
  enqueue(serialized: string): void
  shift(): string | undefined
}

export function createSendQueue(config?: WebSocketQueueConfig): SendQueue {
  const queue: string[] = []
  const maxSize = config?.maxSize ?? Number.POSITIVE_INFINITY
  const overflow = config?.overflow ?? 'drop-oldest'

  return {
    clear() {
      queue.length = 0
    },
    enqueue(serialized) {
      if (queue.length < maxSize) {
        queue.push(serialized)
        return
      }

      switch (overflow) {
        case 'drop-newest':
          return
        case 'drop-oldest':
          queue.shift()
          queue.push(serialized)
          return
        case 'error':
          throw new Error('WebSocket send queue overflow')
      }
    },
    shift() {
      return queue.shift()
    },
  }
}

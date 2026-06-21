import type { ClientWebSocketOptions } from '../client/config'

export type SendQueue = {
  clear(): void
  enqueue(serialized: string): void
  shift(): string | undefined
}

export function createSendQueue(config?: ClientWebSocketOptions['queue']): SendQueue {
  const messages: string[] = []
  const maxSize = config?.maxSize ?? Number.POSITIVE_INFINITY
  const overflow = config?.overflow ?? 'drop-oldest'

  return {
    clear() {
      messages.length = 0
    },
    enqueue(serialized) {
      if (messages.length < maxSize) {
        messages.push(serialized)
        return
      }

      switch (overflow) {
        case 'drop-newest':
          return
        case 'drop-oldest':
          if (messages.length > 0) {
            messages.shift()
          }
          messages.push(serialized)
          return
        case 'error':
          throw new Error('WebSocket send queue overflow')
      }
    },
    shift() {
      return messages.shift()
    },
  }
}

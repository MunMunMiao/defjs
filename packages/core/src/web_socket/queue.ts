export type SendQueue = {
  clear(): void
  enqueue(serialized: string): void
  shift(): string | undefined
}

export function createSendQueue(maxSize: number): SendQueue {
  const messages: string[] = []

  return {
    clear() {
      messages.length = 0
    },
    enqueue(serialized) {
      if (maxSize === 0) {
        throw new Error('WebSocket outgoing queue is disabled')
      }
      if (messages.length >= maxSize) {
        throw new Error('WebSocket send queue overflow')
      }
      messages.push(serialized)
    },
    shift() {
      return messages.shift()
    },
  }
}

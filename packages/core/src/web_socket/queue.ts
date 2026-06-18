import type { ClientWebSocketOptions } from '../client/config'

export type SendQueue = {
  clear(): void
  enqueue(serialized: string): void
  shift(): string | undefined
}

type QueueNode = {
  next?: QueueNode
  value: string
}

export function createSendQueue(config?: ClientWebSocketOptions['queue']): SendQueue {
  let head: QueueNode | undefined
  let tail: QueueNode | undefined
  let size = 0
  const maxSize = config?.maxSize ?? Number.POSITIVE_INFINITY
  const overflow = config?.overflow ?? 'drop-oldest'

  return {
    clear() {
      head = undefined
      tail = undefined
      size = 0
    },
    enqueue(serialized) {
      if (size < maxSize) {
        const node: QueueNode = { value: serialized }
        if (tail) {
          tail.next = node
          tail = node
        } else {
          head = tail = node
        }
        size++
        return
      }

      switch (overflow) {
        case 'drop-newest':
          return
        case 'drop-oldest': {
          if (head) {
            head = head.next
            if (!head) {
              tail = undefined
            }
            size--
          }
          const node: QueueNode = { value: serialized }
          if (tail) {
            tail.next = node
            tail = node
          } else {
            head = tail = node
          }
          size++
          return
        }
        case 'error':
          throw new Error('WebSocket send queue overflow')
      }
    },
    shift() {
      if (!head) {
        return undefined
      }
      const value = head.value
      head = head.next
      if (!head) {
        tail = undefined
      }
      size--
      return value
    },
  }
}

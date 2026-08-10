import { describe, expect, test } from 'vitest'
import { createSendQueue } from './queue'

describe('web socket send queue', () => {
  test('should enqueue and shift messages in order', () => {
    const queue = createSendQueue(2)
    queue.enqueue('a')
    queue.enqueue('b')
    expect(queue.shift()).toBe('a')
    expect(queue.shift()).toBe('b')
    expect(queue.shift()).toBeUndefined()
  })

  test('should clear all messages', () => {
    const queue = createSendQueue(2)
    queue.enqueue('a')
    queue.enqueue('b')
    queue.clear()
    expect(queue.shift()).toBeUndefined()
  })

  test('should throw on overflow without dropping buffered messages', () => {
    const queue = createSendQueue(2)
    queue.enqueue('a')
    queue.enqueue('b')
    expect(() => queue.enqueue('c')).toThrow('WebSocket send queue overflow')
    expect(queue.shift()).toBe('a')
    expect(queue.shift()).toBe('b')
    expect(queue.shift()).toBeUndefined()
  })

  test('should handle enqueue after clear', () => {
    const queue = createSendQueue(2)
    queue.enqueue('a')
    queue.clear()
    queue.enqueue('b')
    expect(queue.shift()).toBe('b')
    expect(queue.shift()).toBeUndefined()
  })

  test('should disable buffering when maxSize is zero', () => {
    const queue = createSendQueue(0)
    expect(() => queue.enqueue('a')).toThrow('WebSocket outgoing queue is disabled')
    expect(queue.shift()).toBeUndefined()
  })
})

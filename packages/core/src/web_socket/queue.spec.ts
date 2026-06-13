import { describe, expect, test } from 'vitest'
import { createSendQueue } from './queue'

describe('web socket send queue', () => {
  test('should enqueue and shift messages in order', () => {
    const queue = createSendQueue()
    queue.enqueue('a')
    queue.enqueue('b')
    expect(queue.shift()).toBe('a')
    expect(queue.shift()).toBe('b')
    expect(queue.shift()).toBeUndefined()
  })

  test('should clear all messages', () => {
    const queue = createSendQueue()
    queue.enqueue('a')
    queue.enqueue('b')
    queue.clear()
    expect(queue.shift()).toBeUndefined()
  })

  test('should drop oldest when overflow with default config', () => {
    const queue = createSendQueue({ maxSize: 2 })
    queue.enqueue('a')
    queue.enqueue('b')
    queue.enqueue('c')
    expect(queue.shift()).toBe('b')
    expect(queue.shift()).toBe('c')
    expect(queue.shift()).toBeUndefined()
  })

  test('should drop newest when overflow config is drop-newest', () => {
    const queue = createSendQueue({ maxSize: 2, overflow: 'drop-newest' })
    queue.enqueue('a')
    queue.enqueue('b')
    queue.enqueue('c')
    expect(queue.shift()).toBe('a')
    expect(queue.shift()).toBe('b')
    expect(queue.shift()).toBeUndefined()
  })

  test('should throw when overflow config is error', () => {
    const queue = createSendQueue({ maxSize: 1, overflow: 'error' })
    queue.enqueue('a')
    expect(() => queue.enqueue('b')).toThrow('WebSocket send queue overflow')
  })

  test('should use infinite maxSize by default', () => {
    const queue = createSendQueue()
    for (let i = 0; i < 100; i++) {
      queue.enqueue(String(i))
    }
    expect(queue.shift()).toBe('0')
  })

  test('should preserve FIFO order across many enqueue/shift cycles', () => {
    const queue = createSendQueue()

    for (let i = 0; i < 1_000; i += 1) {
      queue.enqueue(String(i))
    }

    for (let i = 0; i < 1_000; i += 1) {
      expect(queue.shift()).toBe(String(i))
    }

    expect(queue.shift()).toBeUndefined()
  })

  test('should preserve overflow drop-oldest order at large volume', () => {
    const queue = createSendQueue({ maxSize: 100 })

    for (let i = 0; i < 200; i += 1) {
      queue.enqueue(String(i))
    }

    for (let i = 100; i < 200; i += 1) {
      expect(queue.shift()).toBe(String(i))
    }

    expect(queue.shift()).toBeUndefined()
  })

  test('should drop oldest with maxSize 1', () => {
    const queue = createSendQueue({ maxSize: 1 })
    queue.enqueue('a')
    queue.enqueue('b')
    queue.enqueue('c')
    expect(queue.shift()).toBe('c')
    expect(queue.shift()).toBeUndefined()
  })

  test('should handle enqueue after clear with drop-oldest', () => {
    const queue = createSendQueue({ maxSize: 2 })
    queue.enqueue('a')
    queue.clear()
    queue.enqueue('b')
    expect(queue.shift()).toBe('b')
    expect(queue.shift()).toBeUndefined()
  })

  test('should handle maxSize 0 with drop-oldest', () => {
    const queue = createSendQueue({ maxSize: 0 })
    queue.enqueue('a')
    expect(queue.shift()).toBe('a')
    queue.enqueue('b')
    queue.enqueue('c')
    expect(queue.shift()).toBe('c')
    expect(queue.shift()).toBeUndefined()
  })
})

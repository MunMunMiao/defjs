import { describe, expect, test } from 'vitest'
import { AsyncQueue } from './async_queue'

describe('AsyncQueue', () => {
  test('push and async iterate', async () => {
    const queue = new AsyncQueue<number>()
    queue.push(1)
    queue.push(2)
    queue.close()

    const results: number[] = []
    for await (const value of queue) {
      results.push(value)
    }
    expect(results).toEqual([1, 2])
  })

  test('push before pull resolves immediately', async () => {
    const queue = new AsyncQueue<string>()
    queue.push('a')
    const iter = queue[Symbol.asyncIterator]()
    await expect(iter.next()).resolves.toEqual({ done: false, value: 'a' })
  })

  test('pull before push waits for value', async () => {
    const queue = new AsyncQueue<string>()
    const iter = queue[Symbol.asyncIterator]()
    const promise = iter.next()
    queue.push('b')
    await expect(promise).resolves.toEqual({ done: false, value: 'b' })
  })

  test('close before pull resolves done', async () => {
    const queue = new AsyncQueue<number>()
    queue.close()
    const iter = queue[Symbol.asyncIterator]()
    await expect(iter.next()).resolves.toEqual({ done: true, value: undefined })
  })

  test('close while waiting resolves done', async () => {
    const queue = new AsyncQueue<number>()
    const iter = queue[Symbol.asyncIterator]()
    const promise = iter.next()
    queue.close()
    await expect(promise).resolves.toEqual({ done: true, value: undefined })
  })

  test('fail rejects waiting pulls', async () => {
    const queue = new AsyncQueue<number>()
    const iter = queue[Symbol.asyncIterator]()
    const promise = iter.next()
    queue.fail(new Error('boom'))
    await expect(promise).rejects.toThrow('boom')
  })

  test('fail before pull rejects immediately', async () => {
    const queue = new AsyncQueue<number>()
    queue.fail(new Error('boom'))
    const iter = queue[Symbol.asyncIterator]()
    await expect(iter.next()).rejects.toThrow('boom')
  })

  test('push after close is ignored', () => {
    const queue = new AsyncQueue<number>()
    queue.close()
    queue.push(1)
    // Should not throw
  })

  test('close after close is ignored', () => {
    const queue = new AsyncQueue<number>()
    queue.close()
    queue.close()
    // Should not throw
  })

  test('fail after close is ignored', () => {
    const queue = new AsyncQueue<number>()
    queue.close()
    queue.fail(new Error('ignored'))
    const iter = queue[Symbol.asyncIterator]()
    // Should resolve done, not reject
    return expect(iter.next()).resolves.toEqual({ done: true, value: undefined })
  })

  test('multiple iterators share values', async () => {
    const queue = new AsyncQueue<number>()
    queue.push(1)
    queue.push(2)
    queue.close()

    const iter1 = queue[Symbol.asyncIterator]()
    const iter2 = queue[Symbol.asyncIterator]()
    await expect(iter1.next()).resolves.toEqual({ done: false, value: 1 })
    await expect(iter2.next()).resolves.toEqual({ done: false, value: 2 })
  })

  test('multiple iterators waiting on close', async () => {
    const queue = new AsyncQueue<number>()
    const iter1 = queue[Symbol.asyncIterator]()
    const iter2 = queue[Symbol.asyncIterator]()
    const p1 = iter1.next()
    const p2 = iter2.next()
    queue.close()
    await expect(p1).resolves.toEqual({ done: true, value: undefined })
    await expect(p2).resolves.toEqual({ done: true, value: undefined })
  })
})

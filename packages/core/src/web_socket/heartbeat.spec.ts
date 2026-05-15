import { describe, expect, test, vi } from 'vitest'
import { struct } from '../struct'
import type { HeartbeatSession } from './heartbeat'
import { startHeartbeat, stopHeartbeat } from './heartbeat'
import { createSendQueue } from './queue'

describe('heartbeat', () => {
  function createMockSocket(readyState = WebSocket.OPEN) {
    return {
      readyState,
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket
  }

  function createMockSession(): HeartbeatSession<unknown> {
    return {
      currentSocket: undefined,
      heartbeat: undefined,
      lastRuntimeError: undefined,
    }
  }

  test('should do nothing when config is undefined', () => {
    const session = createMockSession()
    startHeartbeat(createMockSocket(), session, undefined, undefined, createSendQueue(), vi.fn())
    expect(session.heartbeat).toBeUndefined()
  })

  test('should stop existing heartbeat before starting new one', () => {
    const session = createMockSession()
    const existingHeartbeat = {
      isAck: undefined,
      markAck: vi.fn(),
      stop: vi.fn(),
    }
    session.heartbeat = existingHeartbeat

    startHeartbeat(createMockSocket(), session, { intervalMs: 1000 }, undefined, createSendQueue(), vi.fn())

    expect(existingHeartbeat.stop).toHaveBeenCalled()
  })

  test('should send heartbeat message at interval', () => {
    vi.useFakeTimers()
    const socket = createMockSocket()
    const session = createMockSession()
    const messageFn = vi.fn().mockReturnValue({ type: 'ping' })

    startHeartbeat(socket, session, { intervalMs: 100, message: messageFn }, { ping: struct.object({}) }, createSendQueue(), vi.fn())

    expect(messageFn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)
    expect(messageFn).toHaveBeenCalledTimes(1)
    expect(socket.send).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(100)
    expect(messageFn).toHaveBeenCalledTimes(2)
    expect(socket.send).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })

  test('should skip heartbeat when socket is not open', () => {
    vi.useFakeTimers()
    const socket = createMockSocket(WebSocket.CONNECTING)
    const session = createMockSession()

    startHeartbeat(
      socket,
      session,
      { intervalMs: 100, message: () => ({ type: 'ping' }) },
      { ping: struct.object({}) },
      createSendQueue(),
      vi.fn(),
    )

    vi.advanceTimersByTime(100)
    expect(socket.send).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  test('should skip heartbeat when message is undefined', () => {
    vi.useFakeTimers()
    const socket = createMockSocket()
    const session = createMockSession()

    startHeartbeat(socket, session, { intervalMs: 100 }, undefined, createSendQueue(), vi.fn())

    vi.advanceTimersByTime(100)
    expect(socket.send).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  test('should call onError when message serialization fails', () => {
    vi.useFakeTimers()
    const socket = createMockSocket()
    const onError = vi.fn()
    const session = createMockSession()

    startHeartbeat(
      socket,
      session,
      { intervalMs: 100, message: () => ({ type: 'unknown' }) },
      { ping: struct.object({}) },
      createSendQueue(),
      onError,
    )

    vi.advanceTimersByTime(100)
    expect(onError).toHaveBeenCalled()
    expect(socket.send).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  test('should trigger timeout when no ack received', () => {
    vi.useFakeTimers()
    const socket = createMockSocket()
    const onError = vi.fn()
    const session = createMockSession()

    startHeartbeat(
      socket,
      session,
      { intervalMs: 100, timeoutMs: 50, message: () => ({ type: 'ping' }) },
      { ping: struct.object({}) },
      createSendQueue(),
      onError,
    )

    vi.advanceTimersByTime(100)
    expect(socket.send).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(50)
    expect(onError).toHaveBeenCalledWith(new Error('WebSocket heartbeat timeout'))
    expect(socket.close).toHaveBeenCalledWith(4000, 'heartbeat timeout')

    vi.useRealTimers()
  })

  test('should clear timeout on ack', () => {
    vi.useFakeTimers()
    const socket = createMockSocket()
    const onError = vi.fn()
    const session = createMockSession()

    startHeartbeat(
      socket,
      session,
      { intervalMs: 100, timeoutMs: 200, message: () => ({ type: 'ping' }) },
      { ping: struct.object({}) },
      createSendQueue(),
      onError,
    )

    vi.advanceTimersByTime(100)
    expect(socket.send).toHaveBeenCalledTimes(1)

    session.heartbeat?.markAck()

    vi.advanceTimersByTime(200)
    expect(onError).not.toHaveBeenCalled()
    expect(socket.close).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  test('should call isAck to verify ack messages', () => {
    const session = createMockSession()
    const isAck = vi.fn().mockReturnValue(true)

    startHeartbeat(createMockSocket(), session, { intervalMs: 1000, isAck }, undefined, createSendQueue(), vi.fn())

    expect(session.heartbeat?.isAck?.('test')).toBe(true)
    expect(isAck).toHaveBeenCalledWith('test')
  })

  test('should stop heartbeat', () => {
    vi.useFakeTimers()
    const socket = createMockSocket()
    const session = createMockSession()

    startHeartbeat(
      socket,
      session,
      { intervalMs: 100, message: () => ({ type: 'ping' }) },
      { ping: struct.object({}) },
      createSendQueue(),
      vi.fn(),
    )

    stopHeartbeat(session)
    expect(session.heartbeat).toBeUndefined()

    vi.advanceTimersByTime(100)
    expect(socket.send).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  test('should handle close error during timeout', () => {
    vi.useFakeTimers()
    const socket = createMockSocket()
    socket.close = vi.fn(() => {
      throw new Error('already closed')
    })
    const onError = vi.fn()
    const session = createMockSession()
    const sendQueue = createSendQueue()
    sendQueue.enqueue('test')

    startHeartbeat(
      socket,
      session,
      { intervalMs: 100, timeoutMs: 50, message: () => ({ type: 'ping' }) },
      { ping: struct.object({}) },
      sendQueue,
      onError,
    )

    vi.advanceTimersByTime(100)
    vi.advanceTimersByTime(50)

    expect(onError).toHaveBeenCalledTimes(1) // heartbeat timeout only
    expect(sendQueue.shift()).toBeUndefined() // queue cleared

    vi.useRealTimers()
  })
})

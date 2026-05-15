import { describe, expect, test } from 'vitest'
import { ERR_ABORTED, ERR_TIMEOUT } from '../error'
import { schema } from '../schema'
import {
  decodeWebSocketData,
  extractCloseInfo,
  isManualSocketCloseReason,
  isRecord,
  resolveAbortTransportError,
  serializeOutgoingWebSocketMessage,
  transformWebSocketMessage,
} from './codec'

describe('codec helpers', () => {
  test('isRecord identifies plain objects', () => {
    expect(isRecord({})).toBe(true)
    expect(isRecord({ a: 1 })).toBe(true)
    expect(isRecord(null)).toBe(false)
    expect(isRecord([])).toBe(false)
    expect(isRecord('str')).toBe(false)
    expect(isRecord(42)).toBe(false)
    expect(isRecord(undefined)).toBe(false)
  })

  test('extractCloseInfo extracts from CloseEvent', () => {
    const event = { code: 1000, reason: 'normal', wasClean: true } as CloseEvent
    const info = extractCloseInfo(event, new Error('cause'))
    expect(info).toEqual({ cause: new Error('cause'), code: 1000, reason: 'normal', wasClean: true })
  })

  test('extractCloseInfo handles undefined event', () => {
    const info = extractCloseInfo(undefined)
    expect(info).toEqual({ code: undefined, reason: undefined, wasClean: undefined })
  })

  test('isManualSocketCloseReason identifies manual close', () => {
    expect(isManualSocketCloseReason({ kind: 'manual-web-socket-close' })).toBe(true)
    expect(isManualSocketCloseReason({ kind: 'manual-web-socket-close', code: 1000 })).toBe(true)
    expect(isManualSocketCloseReason(null)).toBe(false)
    expect(isManualSocketCloseReason({ kind: 'other' })).toBe(false)
    expect(isManualSocketCloseReason('string')).toBe(false)
  })

  test('resolveAbortTransportError returns undefined when not aborted', () => {
    const signal = new AbortController().signal
    expect(resolveAbortTransportError(signal)).toBeUndefined()
  })

  test('resolveAbortTransportError returns ERR_ABORTED for manual close', () => {
    const controller = new AbortController()
    controller.abort({ kind: 'manual-web-socket-close' })
    const error = resolveAbortTransportError(controller.signal)
    expect(error?.code).toBe('ABORTED')
  })

  test('resolveAbortTransportError returns ERR_TIMEOUT for timeout reason', () => {
    const controller = new AbortController()
    controller.abort(ERR_TIMEOUT)
    const error = resolveAbortTransportError(controller.signal)
    expect(error?.code).toBe('TIMEOUT')
  })

  test('resolveAbortTransportError returns ERR_ABORTED for ERR_ABORTED reason', () => {
    const controller = new AbortController()
    controller.abort(ERR_ABORTED)
    const error = resolveAbortTransportError(controller.signal)
    expect(error?.code).toBe('ABORTED')
  })

  test('resolveAbortTransportError returns NETWORK_ERROR for string reason', () => {
    const controller = new AbortController()
    controller.abort('some reason')
    const error = resolveAbortTransportError(controller.signal)
    expect(error?.code).toBe('NETWORK_ERROR')
  })

  test('resolveAbortTransportError handles DOMException timeout', () => {
    const controller = new AbortController()
    controller.abort(new DOMException('timeout', 'TimeoutError'))
    const error = resolveAbortTransportError(controller.signal)
    expect(error?.code).toBe('TIMEOUT')
  })

  test('resolveAbortTransportError falls back to ERR_ABORTED when reason is undefined', () => {
    const signal = Object.create(AbortSignal.prototype)
    Object.defineProperty(signal, 'aborted', { value: true })
    Object.defineProperty(signal, 'reason', { value: undefined })
    const error = resolveAbortTransportError(signal as AbortSignal)
    expect(error?.code).toBe('ABORTED')
  })

  test('resolveAbortTransportError returns ERR_TIMEOUT for plain Error with matching message', () => {
    const controller = new AbortController()
    controller.abort(new Error(ERR_TIMEOUT.message))
    const error = resolveAbortTransportError(controller.signal)
    expect(error?.code).toBe('TIMEOUT')
  })
})

describe('serializeOutgoingWebSocketMessage', () => {
  test('throws when no outgoing schemas', () => {
    expect(() => serializeOutgoingWebSocketMessage(undefined, { type: 'msg' })).toThrow('No outgoing WebSocket messages')
  })

  test('throws when message lacks type', () => {
    const schemas = { msg: schema.string() }
    expect(() => serializeOutgoingWebSocketMessage(schemas, {} as never)).toThrow('must include a string type')
    expect(() => serializeOutgoingWebSocketMessage(schemas, { type: '' } as never)).toThrow('must include a string type')
    expect(() => serializeOutgoingWebSocketMessage(schemas, null as never)).toThrow('must include a string type')
  })

  test('throws for undeclared message type', () => {
    const schemas = { msg: schema.string() }
    expect(() => serializeOutgoingWebSocketMessage(schemas, { type: 'other' } as never)).toThrow('Undeclared outgoing message type: other')
  })

  test('serializes with data field', () => {
    const schemas = {
      msg: schema.object({ text: schema.string() }),
    }
    const result = serializeOutgoingWebSocketMessage(schemas, { type: 'msg', data: { text: 'hello' } })
    expect(JSON.parse(result)).toEqual({ type: 'msg', text: 'hello' })
  })

  test('serializes with spread fields', () => {
    const schemas = {
      msg: schema.object({ text: schema.string() }),
    }
    const result = serializeOutgoingWebSocketMessage(schemas, { type: 'msg', text: 'hello' } as never)
    expect(JSON.parse(result)).toEqual({ type: 'msg', text: 'hello' })
  })

  test('validates outgoing payload with native schema', () => {
    const schemas = {
      msg: schema.object({ text: schema.string() }),
    }
    expect(() => serializeOutgoingWebSocketMessage(schemas, { type: 'msg', data: { text: 123 } } as never)).toThrow()
  })

  test('validates outgoing payload with standard schema', () => {
    const standardSchema = {
      '~standard': {
        validate: (value: unknown) => {
          if (typeof value === 'string') return { value }
          return { issues: [{ message: 'must be string' }] }
        },
        vendor: 'test',
        version: 1,
      },
    }
    const schemas = { msg: standardSchema as never }
    const result = serializeOutgoingWebSocketMessage(schemas, { type: 'msg', data: 'hello' })
    expect(JSON.parse(result)).toEqual({ type: 'msg', data: 'hello' })

    expect(() => serializeOutgoingWebSocketMessage(schemas, { type: 'msg', data: 123 } as never)).toThrow('must be string')
  })

  test('validates outgoing payload with standard schema issue path as non-array', () => {
    const standardSchema = {
      '~standard': {
        validate: () => ({ issues: [{ message: 'bad', path: 'not-array' as never }] }),
        vendor: 'test',
        version: 1,
      },
    }
    const schemas = { msg: standardSchema as never }
    expect(() => serializeOutgoingWebSocketMessage(schemas, { type: 'msg', data: 'hello' })).toThrow('bad')
  })

  test('validates outgoing payload with standard schema issue missing message', () => {
    const standardSchema = {
      '~standard': {
        validate: () => ({ issues: [{ path: ['field'] }] }),
        vendor: 'test',
        version: 1,
      },
    }
    const schemas = { msg: standardSchema as never }
    expect(() => serializeOutgoingWebSocketMessage(schemas, { type: 'msg', data: 'hello' })).toThrow('Schema parse failed')
  })

  test('throws for async standard schema', () => {
    const standardSchema = {
      '~standard': {
        validate: () => Promise.resolve({ value: 'test' }),
        vendor: 'test',
        version: 1,
      },
    }
    const schemas = { msg: standardSchema as never }
    expect(() => serializeOutgoingWebSocketMessage(schemas, { type: 'msg', data: 'hello' })).toThrow('Async Standard Schema validation is not supported')
  })

  test('serializes with non-schema plain object as passthrough', () => {
    const schemas = { msg: {} as never }
    const result = serializeOutgoingWebSocketMessage(schemas, { type: 'msg', data: 'hello' })
    expect(JSON.parse(result)).toEqual({ type: 'msg', data: 'hello' })
  })
})

describe('transformWebSocketMessage', () => {
  test('returns undefined for non-string non-buffer data', async () => {
    const incoming = { msg: schema.string() }
    expect(await transformWebSocketMessage(incoming, 123)).toBeUndefined()
    expect(await transformWebSocketMessage(incoming, null)).toBeUndefined()
    expect(await transformWebSocketMessage(incoming, undefined)).toBeUndefined()
  })

  test('returns undefined for invalid JSON string', async () => {
    const incoming = { msg: schema.string() }
    expect(await transformWebSocketMessage(incoming, 'not json')).toBeUndefined()
  })

  test('returns undefined when decoded lacks type', async () => {
    const incoming = { msg: schema.string() }
    expect(await transformWebSocketMessage(incoming, '{}')).toBeUndefined()
    expect(await transformWebSocketMessage(incoming, '{"data":1}')).toBeUndefined()
  })

  test('returns undefined for undeclared type without default', async () => {
    const incoming = { msg: schema.string() }
    expect(await transformWebSocketMessage(incoming, '{"type":"other"}')).toBeUndefined()
  })

  test('uses default schema for unknown type', async () => {
    const incoming = {
      default: schema.object({ value: schema.number() }),
    }
    const result = await transformWebSocketMessage(incoming, '{"type":"anything","value":42}')
    expect(result).toEqual({ type: 'anything', value: 42 })
  })

  test('transforms string message', async () => {
    const incoming = {
      msg: schema.object({ text: schema.string() }),
    }
    const result = await transformWebSocketMessage(incoming, '{"type":"msg","text":"hello"}')
    expect(result).toEqual({ type: 'msg', text: 'hello' })
  })

  test('transforms ArrayBuffer message', async () => {
    const incoming = {
      msg: schema.object({ text: schema.string() }),
    }
    const buffer = new TextEncoder().encode('{"type":"msg","text":"hello"}').buffer
    const result = await transformWebSocketMessage(incoming, buffer)
    expect(result).toEqual({ type: 'msg', text: 'hello' })
  })

  test('transforms Uint8Array message', async () => {
    const incoming = {
      msg: schema.object({ text: schema.string() }),
    }
    const arr = new TextEncoder().encode('{"type":"msg","text":"hello"}')
    const result = await transformWebSocketMessage(incoming, arr)
    expect(result).toEqual({ type: 'msg', text: 'hello' })
  })

  test('transforms DataView message', async () => {
    const incoming = {
      msg: schema.object({ text: schema.string() }),
    }
    const arr = new TextEncoder().encode('{"type":"msg","text":"hello"}')
    const view = new DataView(arr.buffer, arr.byteOffset, arr.byteLength)
    const result = await transformWebSocketMessage(incoming, view)
    expect(result).toEqual({ type: 'msg', text: 'hello' })
  })

  test('returns undefined for Blob data', async () => {
    const incoming = { msg: schema.string() }
    const blob = new Blob(['{"type":"msg"}'])
    expect(await transformWebSocketMessage(incoming, blob)).toBeUndefined()
  })

  test('validates with data field', async () => {
    const incoming = {
      msg: schema.object({ text: schema.string() }),
    }
    const result = await transformWebSocketMessage(incoming, '{"type":"msg","data":{"text":"hello"}}')
    expect(result).toEqual({ type: 'msg', text: 'hello' })
  })

  test('throws on schema validation failure', async () => {
    const incoming = {
      msg: schema.object({ text: schema.string() }),
    }
    await expect(transformWebSocketMessage(incoming, '{"type":"msg","text":123}')).rejects.toThrow()
  })

  test('validates with standard schema', async () => {
    const standardSchema = {
      '~standard': {
        validate: (value: unknown) => {
          if (typeof (value as Record<string, unknown>)?.['value'] === 'number') {
            return { value }
          }
          return { issues: [{ message: 'bad value' }] }
        },
        vendor: 'test',
        version: 1,
      },
    }
    const incoming = { msg: standardSchema as never }
    const result = await transformWebSocketMessage(incoming, '{"type":"msg","value":42}')
    expect(result).toEqual({ type: 'msg', value: 42 })
  })
})

import { describe, expect, test } from 'vitest'
import { ERR_ABORTED, ERR_TIMEOUT } from '../error'
import { resolveAbortTransportError } from '../internal/abort'
import { struct } from '../struct'
import { extractCloseInfo, isRecord, serializeOutgoingWebSocketMessage, transformWebSocketMessage } from './codec'
import type { WebSocketIncomingNormalizer, WebSocketOutgoingNormalizer } from './web_socket'

const normalizeProviderFrame: WebSocketIncomingNormalizer = (decoded) => {
  if (!isRecord(decoded)) return undefined
  if (typeof decoded['method'] === 'string') return { data: decoded, type: `method.${decoded['method']}` }
  if (decoded['channel'] === 'heartbeat') return { data: decoded, type: 'channel.heartbeat' }
  if (typeof decoded['channel'] === 'string' && typeof decoded['type'] === 'string') {
    return { data: decoded, type: `${decoded['channel']}.${decoded['type']}` }
  }
  return undefined
}

const normalizeProviderCommand: WebSocketOutgoingNormalizer = (_type, encodedPayload) => {
  if (!isRecord(encodedPayload)) throw new TypeError('Expected encoded provider command object')
  return encodedPayload
}

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

  test('resolveAbortTransportError classifies an explicit abort with a string reason as ABORTED', () => {
    const controller = new AbortController()
    controller.abort('some reason')
    const error = resolveAbortTransportError(controller.signal)
    expect(error?.code).toBe('ABORTED')
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

  test('resolveAbortTransportError treats a plain Error with a timeout-like message as ABORTED', () => {
    const controller = new AbortController()
    controller.abort(new Error(ERR_TIMEOUT.message))
    const error = resolveAbortTransportError(controller.signal)
    expect(error?.code).toBe('ABORTED')
  })
})

describe('serializeOutgoingWebSocketMessage', () => {
  test('throws when no outgoing structs', () => {
    expect(() => serializeOutgoingWebSocketMessage(undefined, { type: 'msg' } as never)).toThrow('No outgoing WebSocket messages')
  })

  test('throws when message lacks type', () => {
    const structs = { msg: struct.string() }
    expect(() => serializeOutgoingWebSocketMessage(structs, {} as never)).toThrow('must include a string type')
    expect(() => serializeOutgoingWebSocketMessage(structs, { type: '' } as never)).toThrow('must include a string type')
    expect(() => serializeOutgoingWebSocketMessage(structs, null as never)).toThrow('must include a string type')
  })

  test('throws for undeclared message type', () => {
    const structs = { msg: struct.string() }
    expect(() => serializeOutgoingWebSocketMessage(structs, { type: 'other' } as never)).toThrow('Undeclared outgoing message type: other')
  })

  test('serializes with data field', () => {
    const structs = {
      msg: struct.object({ text: struct.string() }),
    }
    const result = serializeOutgoingWebSocketMessage(structs, { type: 'msg', data: { text: 'hello' } })
    expect(JSON.parse(result)).toEqual({ type: 'msg', text: 'hello' })
  })

  test('serializes primitive payload into data field', () => {
    const structs = {
      msg: struct.string(),
    }
    const result = serializeOutgoingWebSocketMessage(structs, { type: 'msg', data: 'hello' })
    expect(JSON.parse(result)).toEqual({ type: 'msg', data: 'hello' })
  })

  test('serializes with spread fields', () => {
    const structs = {
      msg: struct.object({ text: struct.string() }),
    }
    const result = serializeOutgoingWebSocketMessage(structs, { type: 'msg', text: 'hello' } as never)
    expect(JSON.parse(result)).toEqual({ type: 'msg', text: 'hello' })
  })

  test('serializes outgoing messages with struct key aliases', () => {
    const structs = {
      msg: struct.object({ text: struct.string().alias('message_text') }),
    }
    const result = serializeOutgoingWebSocketMessage(structs, { type: 'msg', data: { text: 'hello' } })
    expect(JSON.parse(result)).toEqual({ message_text: 'hello', type: 'msg' })
  })

  test('validates outgoing payload with native struct', () => {
    const structs = {
      msg: struct.object({ text: struct.string() }),
    }
    expect(() => serializeOutgoingWebSocketMessage(structs, { type: 'msg', data: { text: 123 } } as never)).toThrow()
  })

  test('preserves legacy outgoing type collision bytes without an adapter', () => {
    const structs = {
      msg: struct.object({ text: struct.string(), type: struct.literal('payload') }),
    }

    expect(serializeOutgoingWebSocketMessage(structs, { data: { text: 'hello', type: 'payload' }, type: 'msg' })).toBe(
      '{"type":"payload","text":"hello"}',
    )
  })

  test('normalizes Struct-encoded provider commands without leaking the logical type', () => {
    const structs = {
      subscribe: struct.object({
        method: struct.literal('subscribe'),
        params: struct.object({ channel: struct.string() }),
        reqId: struct.number().alias('req_id'),
      }),
    }
    let adapterInput: unknown
    const normalizeOutgoing: WebSocketOutgoingNormalizer = (type, encodedPayload) => {
      expect(type).toBe('subscribe')
      adapterInput = encodedPayload
      return normalizeProviderCommand(type, encodedPayload)
    }

    const result = serializeOutgoingWebSocketMessage(
      structs,
      {
        data: { method: 'subscribe', params: { channel: 'ticker' }, reqId: 1 },
        type: 'subscribe',
      },
      normalizeOutgoing,
    )

    expect(adapterInput).toEqual({ method: 'subscribe', params: { channel: 'ticker' }, req_id: 1 })
    expect(result).toBe('{"method":"subscribe","params":{"channel":"ticker"},"req_id":1}')
  })

  const promiseWithToJson = Object.assign(Promise.resolve({ method: 'send' }), {
    toJSON() {
      return { method: 'send' }
    },
  })

  test.each([
    [
      'plain object with toJSON',
      {
        method: 'send',
        toJSON() {
          return { method: 'send' }
        },
      },
    ],
    ['Promise with toJSON', promiseWithToJson],
  ])('rejects %s adapter output before toJSON can replace it', (_name, normalized) => {
    const structs = { send: struct.object({ method: struct.literal('send') }) }
    const normalizeOutgoing = (() => normalized) as unknown as WebSocketOutgoingNormalizer

    expect(() => serializeOutgoingWebSocketMessage(structs, { data: { method: 'send' }, type: 'send' }, normalizeOutgoing)).toThrowError(
      'Outgoing WebSocket normalizer must return a synchronously JSON-serializable value',
    )
  })

  const nullPrototypeObject: Record<string, unknown> = Object.create(null)
  nullPrototypeObject['method'] = 'send'

  test.each([
    ['null', null, 'null'],
    ['boolean', true, 'true'],
    ['string', 'send', '"send"'],
    ['finite number', 1.5, '1.5'],
    ['dense array', [null, true, 'send', 1.5], '[null,true,"send",1.5]'],
    ['null-prototype object', nullPrototypeObject, '{"method":"send"}'],
  ])('serializes strict JSON %s adapter output', (_name, normalized, expected) => {
    const structs = { send: struct.object({ method: struct.literal('send') }) }
    const normalizeOutgoing = (() => normalized) as unknown as WebSocketOutgoingNormalizer

    expect(serializeOutgoingWebSocketMessage(structs, { data: { method: 'send' }, type: 'send' }, normalizeOutgoing)).toBe(expected)
  })

  test('serializes shared non-circular adapter references', () => {
    const structs = { send: struct.object({ method: struct.literal('send') }) }
    const shared = { method: 'send' }

    expect(
      serializeOutgoingWebSocketMessage(structs, { data: { method: 'send' }, type: 'send' }, () => ({ first: shared, second: shared })),
    ).toBe('{"first":{"method":"send"},"second":{"method":"send"}}')
  })

  const sparseArray: unknown[] = []
  sparseArray.length = 1

  const nonPlainObject = Object.create({ inherited: true }) as Record<string, unknown>
  nonPlainObject['method'] = 'send'

  const invalidNormalizedOutgoing: [string, unknown][] = [
    ['top-level Promise', Promise.resolve({ method: 'subscribe' })],
    ['top-level undefined', undefined],
    ['top-level function', () => undefined],
    ['top-level symbol', Symbol('invalid')],
    ['top-level bigint', 1n],
    ['top-level NaN', Number.NaN],
    ['top-level positive infinity', Number.POSITIVE_INFINITY],
    ['top-level negative infinity', Number.NEGATIVE_INFINITY],
    ['top-level Date', new Date(0)],
    ['top-level custom thenable', { then() {} }],
    ['top-level non-plain object', nonPlainObject],
    ['nested sparse array', { invalid: sparseArray }],
    ['nested Promise', { invalid: Promise.resolve('value') }],
    ['nested undefined', { invalid: undefined }],
    ['nested function', { invalid: () => undefined }],
    ['nested symbol', { invalid: Symbol('invalid') }],
    ['nested bigint', { invalid: 1n }],
  ]

  test.each(invalidNormalizedOutgoing)('rejects %s adapter output synchronously', (_name, normalized) => {
    const structs = { subscribe: struct.object({ method: struct.literal('subscribe') }) }
    const normalizeOutgoing = (() => normalized) as unknown as WebSocketOutgoingNormalizer

    expect(() =>
      serializeOutgoingWebSocketMessage(structs, { data: { method: 'subscribe' }, type: 'subscribe' }, normalizeOutgoing),
    ).toThrowError('Outgoing WebSocket normalizer must return a synchronously JSON-serializable value')
  })

  test('rejects circular adapter output synchronously', () => {
    const structs = { subscribe: struct.object({ method: struct.literal('subscribe') }) }
    const circular: { self?: unknown } = {}
    circular.self = circular

    expect(() =>
      serializeOutgoingWebSocketMessage(structs, { data: { method: 'subscribe' }, type: 'subscribe' }, () => circular),
    ).toThrowError('Outgoing WebSocket normalizer must return a synchronously JSON-serializable value')
  })

  test('rethrows the same outgoing adapter error synchronously', () => {
    const structs = { subscribe: struct.object({ method: struct.literal('subscribe') }) }
    const sentinel = new Error('provider adapter failed')
    let thrown: unknown

    try {
      serializeOutgoingWebSocketMessage(structs, { data: { method: 'subscribe' }, type: 'subscribe' }, () => {
        throw sentinel
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBe(sentinel)
  })
})

describe('transformWebSocketMessage', () => {
  test('returns undefined for non-string non-buffer data', async () => {
    const incoming = { msg: struct.string() }
    expect(await transformWebSocketMessage(incoming, 123)).toBeUndefined()
    expect(await transformWebSocketMessage(incoming, null)).toBeUndefined()
    expect(await transformWebSocketMessage(incoming, undefined)).toBeUndefined()
  })

  test('rejects invalid JSON so the session can report a runtime decode error', async () => {
    const incoming = { msg: struct.string() }
    await expect(transformWebSocketMessage(incoming, 'not json')).rejects.toBeInstanceOf(SyntaxError)
  })

  test('returns undefined when decoded lacks type', async () => {
    const incoming = { msg: struct.string() }
    expect(await transformWebSocketMessage(incoming, '{}')).toBeUndefined()
    expect(await transformWebSocketMessage(incoming, '{"data":1}')).toBeUndefined()
  })

  test('returns undefined for undeclared type without default', async () => {
    const incoming = { msg: struct.string() }
    await expect(transformWebSocketMessage(incoming, '{"type":"other"}')).rejects.toMatchObject({
      name: 'MissingWebSocketStructError',
      type: 'other',
    })
  })

  test('uses default struct for unknown type', async () => {
    const incoming = {
      default: struct.object({ value: struct.number() }),
    }
    const result = await transformWebSocketMessage(incoming, '{"type":"anything","value":42}')
    expect(result).toEqual({ type: 'anything', value: 42 })
  })

  test('transforms string message', async () => {
    const incoming = {
      msg: struct.object({ text: struct.string() }),
    }
    const result = await transformWebSocketMessage(incoming, '{"type":"msg","text":"hello"}')
    expect(result).toEqual({ type: 'msg', text: 'hello' })
  })

  test('transforms incoming messages with struct key aliases', async () => {
    const incoming = {
      msg: struct.object({ text: struct.string().alias('message_text') }),
    }
    const result = await transformWebSocketMessage(incoming, '{"type":"msg","message_text":"hello"}')
    expect(result).toEqual({ type: 'msg', text: 'hello' })
  })

  test('transforms ArrayBuffer message', async () => {
    const incoming = {
      msg: struct.object({ text: struct.string() }),
    }
    const buffer = new TextEncoder().encode('{"type":"msg","text":"hello"}').buffer
    const result = await transformWebSocketMessage(incoming, buffer)
    expect(result).toEqual({ type: 'msg', text: 'hello' })
  })

  test('transforms Uint8Array message', async () => {
    const incoming = {
      msg: struct.object({ text: struct.string() }),
    }
    const arr = new TextEncoder().encode('{"type":"msg","text":"hello"}')
    const result = await transformWebSocketMessage(incoming, arr)
    expect(result).toEqual({ type: 'msg', text: 'hello' })
  })

  test('transforms DataView message', async () => {
    const incoming = {
      msg: struct.object({ text: struct.string() }),
    }
    const arr = new TextEncoder().encode('{"type":"msg","text":"hello"}')
    const view = new DataView(arr.buffer, arr.byteOffset, arr.byteLength)
    const result = await transformWebSocketMessage(incoming, view)
    expect(result).toEqual({ type: 'msg', text: 'hello' })
  })

  test('returns undefined for Blob data with undeclared type', async () => {
    const incoming = { msg: struct.string() }
    const blob = new Blob(['{"type":"other"}'])
    await expect(transformWebSocketMessage(incoming, blob)).rejects.toMatchObject({
      name: 'MissingWebSocketStructError',
      type: 'other',
    })
  })

  test('transforms Blob message', async () => {
    const incoming = {
      msg: struct.object({ text: struct.string() }),
    }
    const blob = new Blob([JSON.stringify({ type: 'msg', text: 'hello' })])
    const result = await transformWebSocketMessage(incoming, blob)
    expect(result).toEqual({ type: 'msg', text: 'hello' })
  })

  test('validates with data field', async () => {
    const incoming = {
      msg: struct.object({ text: struct.string() }),
    }
    const result = await transformWebSocketMessage(incoming, '{"type":"msg","data":{"text":"hello"}}')
    expect(result).toEqual({ type: 'msg', text: 'hello' })
  })

  test('throws on struct validation failure', async () => {
    const incoming = {
      msg: struct.object({ text: struct.string() }),
    }
    await expect(transformWebSocketMessage(incoming, '{"type":"msg","text":123}')).rejects.toThrow()
  })

  test('normalizes provider method, heartbeat and channel frames to composite dispatch tags', async () => {
    const incoming = {
      'channel.heartbeat': struct.object({ channel: struct.literal('heartbeat') }),
      'method.subscribe': struct.object({
        method: struct.literal('subscribe'),
        result: struct.object({ channel: struct.string() }),
        success: struct.boolean(),
      }),
      'ticker.update': struct.object({
        channel: struct.literal('ticker'),
        data: struct.array(struct.object({ last: struct.number(), symbol: struct.string() })),
        providerType: struct.literal('update').alias('type'),
      }),
    }

    await expect(
      transformWebSocketMessage(incoming, '{"method":"subscribe","success":true,"result":{"channel":"ticker"}}', normalizeProviderFrame),
    ).resolves.toEqual({ method: 'subscribe', result: { channel: 'ticker' }, success: true, type: 'method.subscribe' })
    await expect(transformWebSocketMessage(incoming, '{"channel":"heartbeat"}', normalizeProviderFrame)).resolves.toEqual({
      channel: 'heartbeat',
      type: 'channel.heartbeat',
    })
    await expect(
      transformWebSocketMessage(
        incoming,
        '{"channel":"ticker","type":"update","data":[{"symbol":"BTC/USD","last":1}]}',
        normalizeProviderFrame,
      ),
    ).resolves.toEqual({
      channel: 'ticker',
      data: [{ last: 1, symbol: 'BTC/USD' }],
      providerType: 'update',
      type: 'ticker.update',
    })
  })

  test('normalized dispatch tag overwrites a decoded payload type collision', async () => {
    const incoming = {
      'ticker.update': struct.object({
        channel: struct.literal('ticker'),
        type: struct.literal('update'),
      }),
    }

    await expect(transformWebSocketMessage(incoming, '{"channel":"ticker","type":"update"}', normalizeProviderFrame)).resolves.toEqual({
      channel: 'ticker',
      type: 'ticker.update',
    })
  })

  test('configured incoming normalizer can intentionally ignore a legacy frame without fallback', async () => {
    const incoming = { legacy: struct.object({ data: struct.string() }) }
    const ignore: WebSocketIncomingNormalizer = () => undefined

    await expect(transformWebSocketMessage(incoming, '{"type":"legacy","data":"ok"}', ignore)).resolves.toBeUndefined()
  })

  test('preserves the exact legacy frame result without an incoming normalizer', async () => {
    const incoming = { legacy: struct.string() }

    await expect(transformWebSocketMessage(incoming, '{"type":"legacy","data":"ok"}')).resolves.toEqual({
      data: 'ok',
      type: 'legacy',
    })
  })

  test('preserves legacy incoming data.type collision behavior without an adapter', async () => {
    const incoming = {
      msg: struct.object({ text: struct.string(), type: struct.literal('payload') }),
    }

    await expect(transformWebSocketMessage(incoming, '{"type":"msg","data":{"type":"payload","text":"hello"}}')).resolves.toEqual({
      text: 'hello',
      type: 'payload',
    })
  })

  const invalidNormalizedIncoming: [string, unknown][] = [
    ['null', null],
    ['number', 1],
    ['string', 'bad'],
    ['array', []],
    ['Promise', Promise.resolve({ data: {}, type: 'event' })],
    ['empty object', {}],
    ['missing data', { type: 'event' }],
    ['empty type', { data: {}, type: '' }],
  ]

  test.each(invalidNormalizedIncoming)('rejects invalid incoming adapter result: %s', async (_name, normalized) => {
    const incoming = { event: struct.object({ ok: struct.boolean() }) }
    const normalizeIncoming = (() => normalized) as unknown as WebSocketIncomingNormalizer

    await expect(transformWebSocketMessage(incoming, '{}', normalizeIncoming)).rejects.toThrowError(
      'Incoming WebSocket normalizer must return undefined or an object with a non-empty string type and data',
    )
  })

  test('reports normalized primitive data on missing Struct errors', async () => {
    const incoming = { event: struct.object({ ok: struct.boolean() }) }
    const normalizeIncoming: WebSocketIncomingNormalizer = () => ({ data: 'primitive', type: 'unknown' })

    await expect(transformWebSocketMessage(incoming, '{}', normalizeIncoming)).rejects.toMatchObject({
      decoded: 'primitive',
      name: 'MissingWebSocketStructError',
      type: 'unknown',
    })
  })

  test('wraps a normalized primitive payload in data after Struct decoding', async () => {
    const incoming = { 'method.count': struct.number() }
    const normalizeIncoming: WebSocketIncomingNormalizer = () => ({ data: 3, type: 'method.count' })

    await expect(transformWebSocketMessage(incoming, '{}', normalizeIncoming)).resolves.toEqual({
      data: 3,
      type: 'method.count',
    })
  })
})

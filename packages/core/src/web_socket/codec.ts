import type { AnyStruct } from '../struct'
import { decodeJson, encodeJson } from '../struct/codec/json'
import { parseStructValue } from '../struct/introspection'
import type {
  SocketStructs,
  WebSocketIncomingData,
  WebSocketIncomingNormalizer,
  WebSocketOutgoingData,
  WebSocketOutgoingNormalizer,
} from './web_socket'

const INVALID_INCOMING_NORMALIZER_RESULT =
  'Incoming WebSocket normalizer must return undefined or an object with a non-empty string type and data'
const INVALID_OUTGOING_NORMALIZER_RESULT = 'Outgoing WebSocket normalizer must return a synchronously JSON-serializable value'

// ---- outgoing serialization ----

export function serializeOutgoingWebSocketMessage<TOutgoing extends SocketStructs | undefined>(
  structs: TOutgoing,
  message: WebSocketOutgoingData<TOutgoing>,
  normalizeOutgoing?: WebSocketOutgoingNormalizer,
): string {
  if (!structs) {
    throw new Error('No outgoing WebSocket messages are declared for this endpoint')
  }

  if (!isRecord(message) || typeof message.type !== 'string' || message.type.length === 0) {
    throw new Error('Outgoing WebSocket messages must include a string type')
  }

  const struct = structs[message.type]
  if (!struct) {
    throw new Error(`Undeclared outgoing message type: ${message.type}`)
  }

  const payload = 'data' in message ? message.data : omitSocketType(message)

  const encodedPayload = serializeStructPayload(struct, payload)
  if (!normalizeOutgoing) {
    return JSON.stringify(normalizeSocketPayload(message.type, encodedPayload))
  }

  const normalized = normalizeOutgoing(message.type, encodedPayload)
  return stringifyNormalizedWebSocketOutgoing(normalized)
}

function serializeStructPayload(struct: AnyStruct, payload: unknown): unknown {
  // Outgoing validation should stay synchronous for send() ergonomics.
  return encodeJson(struct, parseStructValue(struct, payload))
}

function stringifyNormalizedWebSocketOutgoing(normalized: unknown): string {
  try {
    const serialized = JSON.stringify(cloneStrictJsonValue(normalized, new Set<object>()))

    /* istanbul ignore if -- @preserve defensive: cloneStrictJsonValue only returns native JSON values */
    if (typeof serialized !== 'string') {
      throw new TypeError(INVALID_OUTGOING_NORMALIZER_RESULT)
    }
    return serialized
  } catch (cause) {
    throw new TypeError(INVALID_OUTGOING_NORMALIZER_RESULT, { cause })
  }
}

function cloneStrictJsonValue(value: unknown, ancestors: Set<object>): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(INVALID_OUTGOING_NORMALIZER_RESULT)
    }
    return value
  }
  if (typeof value !== 'object' || isPromiseLike(value)) {
    throw new TypeError(INVALID_OUTGOING_NORMALIZER_RESULT)
  }
  if (ancestors.has(value)) {
    throw new TypeError(INVALID_OUTGOING_NORMALIZER_RESULT)
  }

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      const clone: unknown[] = []
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          throw new TypeError(INVALID_OUTGOING_NORMALIZER_RESULT)
        }
        clone.push(cloneStrictJsonValue(value[index], ancestors))
      }
      return clone
    }

    const prototype = Object.getPrototypeOf(value) as unknown
    if (prototype !== null && prototype !== Object.prototype) {
      throw new TypeError(INVALID_OUTGOING_NORMALIZER_RESULT)
    }

    const clone: Record<string, unknown> = Object.create(null)
    for (const key of Object.keys(value)) {
      clone[key] = cloneStrictJsonValue((value as Record<string, unknown>)[key], ancestors)
    }
    return clone
  } finally {
    ancestors.delete(value)
  }
}

function isPromiseLike(value: object): boolean {
  return typeof (value as { then?: unknown }).then === 'function'
}

// ---- incoming transformation ----

export async function transformWebSocketMessage<TIncoming extends SocketStructs>(
  incoming: TIncoming,
  raw: unknown,
  normalizeIncoming?: WebSocketIncomingNormalizer,
): Promise<WebSocketIncomingData<TIncoming> | undefined> {
  const decoded = await decodeWebSocketData(raw)

  if (normalizeIncoming) {
    const normalized = normalizeIncoming(decoded)
    if (typeof normalized === 'undefined') {
      return undefined
    }
    if (!isRecord(normalized) || typeof normalized['type'] !== 'string' || normalized['type'].length === 0 || !('data' in normalized)) {
      throw new TypeError(INVALID_INCOMING_NORMALIZER_RESULT)
    }

    const messageType = normalized['type']
    const struct = incoming[messageType] ?? incoming['default']
    if (!struct) {
      throw new MissingWebSocketStructError(messageType, normalized['data'])
    }
    const value = decodeJson(struct, normalized['data'])
    if (isRecord(value)) {
      return { ...value, type: messageType } as WebSocketIncomingData<TIncoming>
    }
    return { data: value, type: messageType } as WebSocketIncomingData<TIncoming>
  }

  if (!isRecord(decoded) || typeof decoded['type'] !== 'string' || decoded['type'].length === 0) {
    return undefined
  }

  const messageType = decoded['type']
  const struct = incoming[messageType] ?? incoming['default']
  if (!struct) {
    throw new MissingWebSocketStructError(messageType, decoded)
  }

  const payload = 'data' in decoded ? decoded['data'] : omitSocketType(decoded)

  const value = decodeJson(struct, payload)

  return normalizeSocketPayload(messageType, value) as WebSocketIncomingData<TIncoming>
}

/** Thrown when an incoming WebSocket frame has a `type` with no declared struct. */
export class MissingWebSocketStructError extends Error {
  readonly decoded: unknown
  readonly type: string

  constructor(type: string, decoded: unknown) {
    super(`Undeclared incoming WebSocket message type: ${type}`)
    this.name = 'MissingWebSocketStructError'
    this.type = type
    this.decoded = decoded
  }
}

async function decodeWebSocketData(raw: unknown): Promise<unknown> {
  if (typeof raw === 'string') {
    return decodeWebSocketText(raw)
  }

  if (raw instanceof ArrayBuffer) {
    return decodeWebSocketText(new TextDecoder().decode(raw))
  }

  if (ArrayBuffer.isView(raw)) {
    return decodeWebSocketText(new TextDecoder().decode(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)))
  }

  if (typeof Blob !== 'undefined' && raw instanceof Blob) {
    return decodeWebSocketText(new TextDecoder().decode(await raw.arrayBuffer()))
  }

  return undefined
}

function decodeWebSocketText(text: string): unknown {
  return JSON.parse(text)
}

function normalizeSocketPayload(type: string, payload: unknown): { [key: string]: unknown } {
  if (isRecord(payload)) {
    return {
      type,
      ...payload,
    }
  }

  return {
    data: payload,
    type,
  }
}

function omitSocketType(value: { [key: string]: unknown }): { [key: string]: unknown } {
  const { type: _type, ...payload } = value
  return payload
}

export function isRecord(value: unknown): value is { [key: string]: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// ---- close-info helpers ----

export interface WebSocketCloseSnapshot {
  cause?: unknown
  code?: number
  reason?: string
  wasClean?: boolean
}

export function extractCloseInfo(event?: CloseEvent, cause?: unknown): WebSocketCloseSnapshot {
  return {
    cause,
    code: event?.code,
    reason: event?.reason,
    wasClean: event?.wasClean,
  }
}

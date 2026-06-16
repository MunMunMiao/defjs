import type { TransportError } from '../error'
import { createTransportError, ERR_ABORTED, ERR_TIMEOUT } from '../error'
import type { AnyStruct } from '../struct'
import { decodeJson, encodeJson } from '../struct/codec/json'
import { parseStructValue } from '../struct/introspection'
import type { ManualSocketCloseReason, SocketSchemas, WebSocketCloseInfo, WebSocketIncomingData, WebSocketOutgoingData } from './web_socket'

// ---- outgoing serialization ----

export function serializeOutgoingWebSocketMessage<TOutgoing extends SocketSchemas | undefined>(
  schemas: TOutgoing,
  message: WebSocketOutgoingData<TOutgoing>,
): string {
  if (!schemas) {
    throw new Error('No outgoing WebSocket messages are declared for this endpoint')
  }

  if (!isRecord(message) || typeof message.type !== 'string' || message.type.length === 0) {
    throw new Error('Outgoing WebSocket messages must include a string type')
  }

  const schema = schemas[message.type]
  if (!schema) {
    throw new Error(`Undeclared outgoing message type: ${message.type}`)
  }

  const payload = 'data' in message ? message.data : omitSocketType(message)

  return JSON.stringify(normalizeSocketPayload(message.type, serializeStructPayload(schema, payload)))
}

function serializeStructPayload(schema: AnyStruct, payload: unknown): unknown {
  // Outgoing validation should stay synchronous for send() ergonomics.
  return encodeJson(schema, parseStructValue(schema, payload))
}

// ---- incoming transformation ----

export async function transformWebSocketMessage<TIncoming extends SocketSchemas>(
  incoming: TIncoming,
  raw: unknown,
): Promise<WebSocketIncomingData<TIncoming> | undefined> {
  const decoded = await decodeWebSocketData(raw)
  if (!isRecord(decoded) || typeof decoded['type'] !== 'string' || decoded['type'].length === 0) {
    return undefined
  }

  const messageType = decoded['type']
  const schema = incoming[messageType] ?? incoming['default']
  if (!schema) {
    return undefined
  }

  const payload = 'data' in decoded ? decoded['data'] : omitSocketType(decoded)

  const value = decodeJson(schema, payload)

  return normalizeSocketPayload(messageType, value) as WebSocketIncomingData<TIncoming>
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
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
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

export function extractCloseInfo(event?: CloseEvent, cause?: unknown): WebSocketCloseInfo & { cause?: unknown } {
  return {
    cause,
    code: event?.code,
    reason: event?.reason,
    wasClean: event?.wasClean,
  }
}

export function isManualSocketCloseReason(value: unknown): value is ManualSocketCloseReason {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'manual-web-socket-close'
}

export function resolveAbortTransportError(signal: AbortSignal): TransportError | undefined {
  if (!signal.aborted) {
    return undefined
  }

  const reason = signal.reason
  if (isManualSocketCloseReason(reason)) {
    return createTransportError(ERR_ABORTED)
  }

  if (isTimeoutReason(reason)) {
    return createTransportError(ERR_TIMEOUT)
  }

  return createTransportError(reason ?? ERR_ABORTED)
}

function isTimeoutReason(value: unknown): boolean {
  return (
    value === ERR_TIMEOUT ||
    (value instanceof Error && value.message === ERR_TIMEOUT.message) ||
    (value instanceof DOMException && value.name === 'TimeoutError')
  )
}

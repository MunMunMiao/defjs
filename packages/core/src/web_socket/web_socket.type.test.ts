import { expectTypeOf } from 'vitest'
import type { WEB_SOCKET_COMMAND } from '../client/command'
import { COMMAND_TYPE } from '../client/command'
import {
  defineWebSocket,
  type WebSocketExecuteOptions,
  type WebSocketIncomingData,
  type WebSocketOutgoingData,
  type WebSocketSession,
} from './web_socket'
import { struct } from '../struct'

const useChat = defineWebSocket({
  path: '/ws',
  maxIncomingQueueSize: 16,
  incoming: { message: struct.object({ text: struct.string() }) },
})

// @ts-expect-error maxIncomingQueueSize is required for every endpoint owner
defineWebSocket({ path: '/ws', incoming: { message: struct.string() } })

const command = useChat()
expectTypeOf(command[COMMAND_TYPE]).toEqualTypeOf<typeof WEB_SOCKET_COMMAND>()
expectTypeOf(command.endpoint.path).toEqualTypeOf<string>()
expectTypeOf(command.endpoint.maxIncomingQueueSize).toEqualTypeOf<number>()

async function assertAsyncDisposableWebSocketSession(value: WebSocketSession): Promise<void> {
  const disposable: AsyncDisposable = value
  const result: PromiseLike<void> = value[Symbol.asyncDispose]()
  void disposable
  void result

  await using ownedSession = value
  void ownedSession
}
void assertAsyncDisposableWebSocketSession

const options: WebSocketExecuteOptions = {
  beforeConnect({ attempt, signal }) {
    expectTypeOf(attempt).toEqualTypeOf<number>()
    expectTypeOf(signal).toEqualTypeOf<AbortSignal>()
  },
}
void options

const removedQueueOption: WebSocketExecuteOptions = {
  // @ts-expect-error execute-level queue policy was removed
  queue: { maxSize: 1 },
}
void removedQueueOption

const providerIncoming = {
  'channel.heartbeat': struct.object({ channel: struct.literal('heartbeat') }),
  'method.subscribe': struct.object({ method: struct.literal('subscribe'), success: struct.boolean() }),
  'ticker.update': struct.object({
    channel: struct.literal('ticker'),
    providerType: struct.literal('update').alias('type'),
  }),
}
const providerOutgoing = {
  ping: struct.object({ method: struct.literal('ping'), reqId: struct.number().alias('req_id') }),
  subscribe: struct.object({ method: struct.literal('subscribe'), reqId: struct.number().alias('req_id') }),
}

defineWebSocket({
  incoming: providerIncoming,
  maxIncomingQueueSize: 3,
  normalizeIncoming: (decoded) => ({ data: decoded, type: 'method.subscribe' }),
  normalizeOutgoing: (_type, encodedPayload) => encodedPayload as { readonly [key: string]: unknown },
  outgoing: providerOutgoing,
  path: '/provider',
})

type ProviderIncoming = WebSocketIncomingData<typeof providerIncoming>
expectTypeOf<ProviderIncoming['type']>().toEqualTypeOf<'channel.heartbeat' | 'method.subscribe' | 'ticker.update'>()

function assertProviderIncoming(message: ProviderIncoming): void {
  if (message.type === 'ticker.update') {
    expectTypeOf(message.providerType).toEqualTypeOf<'update'>()
  }
}
void assertProviderIncoming

const providerCommand: WebSocketOutgoingData<typeof providerOutgoing> = {
  data: { method: 'subscribe', reqId: 1 },
  type: 'subscribe',
}
void providerCommand

// @ts-expect-error outgoing messages still require the logical command tag
const providerWireOnly: WebSocketOutgoingData<typeof providerOutgoing> = { method: 'subscribe', reqId: 1 }
void providerWireOnly

defineWebSocket({
  incoming: { event: struct.object({ ok: struct.boolean() }) },
  maxIncomingQueueSize: 1,
  path: '/ws',
  // @ts-expect-error incoming normalizers are synchronous
  normalizeIncoming: async () => ({ data: { ok: true }, type: 'event' }),
})

defineWebSocket({
  incoming: {},
  maxIncomingQueueSize: 1,
  outgoing: { ping: struct.object({ method: struct.literal('ping') }) },
  path: '/ws',
  // @ts-expect-error outgoing normalizers cannot return Promise
  normalizeOutgoing: async () => ({ method: 'ping' }),
})

export type Cases = true

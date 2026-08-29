---
title: WebSocket
description: defineWebSocket، الجلسة، وخيارات التنفيذ.
---

# WebSocket

أعلن مقبسًا، نفّذه، أرسل/استقبل رسائل مُنوَّعة، ثم أغلق.

## defineWebSocket() {#defineWebSocket}

```ts
function defineWebSocket(definition: WebSocketDefinition): WebSocketCommandBuilder
```

- **definition** — `path`، structs `incoming`، `outgoing` اختياري، `input`، `build`، حدود الطابور.
- **يُرجع** منشئًا. استدعِه بالمدخل لتحصل على `WebSocketCommand`.

```ts
import { defineWebSocket, struct } from '@defjs/core'

const chat = defineWebSocket({
  path: '/chat',
  incoming: { message: struct.object({ text: struct.string() }) },
  outgoing: { message: struct.object({ text: struct.string() }) },
})
```

## executeWebSocketCommand() {#executeWebSocketCommand}

```ts
function executeWebSocketCommand(
  clientConfig: ClientConfig,
  command: WebSocketCommand,
  options?: WebSocketExecuteOptions,
): Promise<SocketAwaitResult>
```

مدخل منخفض المستوى لـ `client.execute`. فضّل العميل في شيفرة التطبيق.

- **يُرجع** `[null, session, connection]` أو `[error, undefined, connection?]`.

تنفيذ WebSocket يمكنه تجاوز `beforeConnect` و`heartbeat` و`protocols` و`reconnect`.

## WebSocketSession {#WebSocketSession}

```ts
interface WebSocketSession<TIncoming, TOutgoing> extends AsyncDisposable {
  readonly bufferedAmount: number
  readonly connection: WebSocketConnectionInfo
  readonly closed: Promise<WebSocketCloseInfo>
  readonly receive: AsyncIterable<TIncoming>
  readonly state: WebSocketState
  close(code?: number, reason?: string): void
  [Symbol.asyncDispose](): PromiseLike<void>
  send(message: TOutgoing): void
  onRuntimeError(listener: (error: unknown) => void): () => void
  onStateChange(listener: (state: WebSocketState) => void): () => void
}
```

أنت تملك التنظيف؛ استخدم `await using`. يبقى `close()` و`closed` متاحين. `closed` هو نهاية lifecycle المنطقية. ينتظر disposer تنظيف Defjs بحد ثانية واحدة؛ إذا لم يُرصد حدث close فقد يرفض بـ `DOMException` اسمه `TimeoutError`. هذا لا يثبت أن TCP المادي أُغلق.

### WebSocketState {#WebSocketState}

`'idle' | 'connecting' | 'open' | 'closing' | 'closed' | 'reconnecting' | 'aborted' | 'error'`

### WebSocketConnectionInfo {#WebSocketConnectionInfo}

`url`، `protocol`، `extensions`، `generation` (تزداد عند إعادة الاتصال).

### WebSocketCloseInfo {#WebSocketCloseInfo}

لقطة الإغلاق بعد انتهاء المقبس (`code`، `reason`، علامة الإغلاق النظيف، `cause` اختياري). الإغلاق اليدوي يمكن أن يحمل `ManualSocketCloseReason`.

## خيارات التنفيذ

## WebSocketExecuteOptions {#WebSocketExecuteOptions}

```ts
type WebSocketExecuteOptions = {
  abort?: AbortSignal
  timeout?: number
  signal?: AbortSignal
  beforeConnect?: (context: { attempt: number; signal: AbortSignal }) => void | Promise<void>
  protocols?: readonly string[]
  heartbeat?: WebSocketHeartbeatConfig
  reconnect?: ClientWebSocketOptions['reconnect']
}
```

`WebSocketHeartbeatConfig`: `intervalMs`، و`message` و`isAck` و`timeoutMs` اختيارية.

## خرائط الرسائل

## SocketStructs {#SocketStructs}

```ts
type SocketStructs = { [typeName: string]: AnyStruct }
```

الحمولات الواردة/الصادرة موسومة بـ `type` (وحقول مسطّحة أو غلاف `data` حسب شكل الـ struct).

انظر [دليل WebSocket](../core/web-socket.md) و[فتح جلسة WebSocket](../recipes/websocket-session.md).

## WebSocketDefinition {#WebSocketDefinition}

`path` و`incoming` و`outgoing` / `input` / `build` اختيارية، مع حدود الطابور.

## WebSocketCommandBuilder {#WebSocketCommandBuilder}

يعيده `defineWebSocket`. استدعه بالمدخل لتحصل على `WebSocketCommand`.

## WebSocketCommand {#WebSocketCommand}

أمر WebSocket معتم. مرّره إلى `client.execute`.

## UseWebSocketConfig {#UseWebSocketConfig}

نبض وإعادة اتصال و`beforeConnect` والبروتوكولات مع الإلغاء. `WebSocketExecuteOptions` يضيف `signal`.

## SocketAwaitResult {#SocketAwaitResult}

`[null, session, connection]` or `[error, undefined, connection?]`.

## ManualSocketCloseReason {#ManualSocketCloseReason}

السبب المسجَّل عند الإغلاق بـ `session.close()`.

## WebSocketHeartbeatConfig {#WebSocketHeartbeatConfig}

`intervalMs`, optional `message`, `isAck`, `timeoutMs`.

## WebSocketIncomingData {#WebSocketIncomingData}

شكل الرسالة الواردة المستنتج من خريطة `SocketStructs` الواردة.

## WebSocketOutgoingData {#WebSocketOutgoingData}

شكل الرسالة الصادرة المستنتج من خريطة `SocketStructs` الصادرة.

## SocketLifecycleOutcome {#SocketLifecycleOutcome}

لقطة نهاية دورة الحياة بعد انتهاء المقبس.

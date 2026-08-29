---
title: WebSocket
description: defineWebSocket, 세션, 실행 옵션이에요.
---

# WebSocket

소켓을 선언하고, 실행하고, 타입이 잡힌 메시지를 보내고 받은 뒤 닫아요.

## defineWebSocket() {#defineWebSocket}

```ts
function defineWebSocket(definition: WebSocketDefinition): WebSocketCommandBuilder
```

- **definition** — `path`, `incoming` Struct, 선택 `outgoing`, `input`, `build`, queue 한도예요.
- **Returns** 빌더예요. 입력을 넣으면 `WebSocketCommand`가 나와요.

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

`client.execute`의 저수준 진입점이에요. 앱 코드에서는 클라이언트를 쓰세요.

- **Returns** `[null, session, connection]` 또는 `[error, undefined, connection?]`예요.

WebSocket 실행은 `beforeConnect`, `heartbeat`, `protocols`, `reconnect`를 덮어쓸 수 있어요.

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

소유한 범위는 `await using ownedSession = session`으로 정리하세요. 수동 `session.close()`와 `await session.closed`도 그대로 쓸 수 있어요.

```ts
async function consume(session: WebSocketSession<unknown, never>): Promise<void> {
  await using ownedSession = session
  for await (const message of ownedSession.receive) console.log(message)
}
```

`closed`는 논리적인 종료 상태를 알려 줘요. Async disposer는 네이티브 close를 요청하고 Defjs 소유 teardown을 기다리지만, close event가 없으면 1초로 제한하고 `TimeoutError`라는 이름의 `DOMException`으로 reject할 수 있어요. 물리 TCP 연결이 닫혔다는 사실까지 증명하지는 못해요.

### WebSocketState {#WebSocketState}

`'idle' | 'connecting' | 'open' | 'closing' | 'closed' | 'reconnecting' | 'aborted' | 'error'`

### WebSocketConnectionInfo {#WebSocketConnectionInfo}

`url`, `protocol`, `extensions`, `generation` (재연결마다 증가해요).

### WebSocketCloseInfo {#WebSocketCloseInfo}

소켓이 끝난 뒤의 닫기 스냅샷이에요 (code, reason, clean 플래그, 선택 cause). 수동 닫기는 `ManualSocketCloseReason`을 담을 수 있어요.

## 실행 options

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

`WebSocketHeartbeatConfig`: `intervalMs`, 선택 `message`, `isAck`, `timeoutMs`예요.

## 메시지 map

## SocketStructs {#SocketStructs}

```ts
type SocketStructs = { [typeName: string]: AnyStruct }
```

incoming/outgoing 페이로드는 `type`으로 태그가 붙어요 (Struct 형태에 따라 펼친 필드나 `data` 래퍼).

자세한 내용은 [WebSocket 가이드](../core/web-socket.md)와 [WebSocket 세션 열기](../recipes/websocket-session.md)를 보세요.

## WebSocketDefinition {#WebSocketDefinition}

`path`, `incoming`, 선택 `outgoing` / `input` / `build`, 큐 한도예요.

## WebSocketCommandBuilder {#WebSocketCommandBuilder}

`defineWebSocket`가 돌려주는 값이에요. input을 넣어 호출하면 `WebSocketCommand`가 나와요.

## WebSocketCommand {#WebSocketCommand}

불투명 WebSocket command예요. `client.execute`에 넣어요.

## UseWebSocketConfig {#UseWebSocketConfig}

heartbeat, reconnect, `beforeConnect`, protocols, 그리고 취소예요. `WebSocketExecuteOptions`가 `signal`을 더해요.

## SocketAwaitResult {#SocketAwaitResult}

`[null, session, connection]` or `[error, undefined, connection?]`.

## ManualSocketCloseReason {#ManualSocketCloseReason}

`session.close()`로 닫을 때 적어 두는 이유예요.

## WebSocketHeartbeatConfig {#WebSocketHeartbeatConfig}

`intervalMs`, optional `message`, `isAck`, `timeoutMs`.

## WebSocketIncomingData {#WebSocketIncomingData}

incoming `SocketStructs` map에서 추론한 수신 메시지 모양이에요.

## WebSocketOutgoingData {#WebSocketOutgoingData}

outgoing `SocketStructs` map에서 추론한 송신 메시지 모양이에요.

## SocketLifecycleOutcome {#SocketLifecycleOutcome}

소켓이 끝난 뒤의 종료 스냅샷이에요.

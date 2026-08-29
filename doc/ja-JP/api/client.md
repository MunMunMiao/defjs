---
title: Client
description: createClient、option ヘルパー、Client 型です。
---

# Client {#page}

クライアントを作り、options を左から右へ合成して、HTTP / SSE / WebSocket コマンドを `execute` します。

## createClient() {#createClient}

```ts
function createClient(...options: ClientOption[]): Client
```

options は順に適用されます。インターセプターが auth やテナントを掴むなら、クライアントはリクエスト境界の中で作ってください。

- **options** — `withEndpoint` のような option ヘルパーです。
- **戻り値** — `execute` がトランスポートごとにオーバーロードされたクライアントです。

```ts
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

## option ヘルパー

### withEndpoint() {#withEndpoint}

```ts
function withEndpoint(endpoint: string): ClientOption
```

相対 path の前に付けるベース URL をセットします。

### withInterceptors() {#withInterceptors}

```ts
function withInterceptors(...interceptors: Interceptor[]): ClientOption
```

登録順でインターセプターを追記します。混在の kind は execute 時にトランスポートでフィルタされます。

### withQueryParamsSerializer() {#withQueryParamsSerializer}

```ts
function withQueryParamsSerializer(serializer: QueryParamsSerializer): ClientOption
```

query のエンコードを差し替えます。`serializer(params, rawParams?)` は先頭の `?` なしの query 文字列を返す必要があります。

### withHTTPHandle() {#withHTTPHandle}

### withSSEHandle() {#withSSEHandle}

### withWebSocketHandle() {#withWebSocketHandle}

```ts
function withHTTPHandle(fetchImpl: typeof fetch): ClientOption
function withSSEHandle(fetchImpl: typeof fetch): ClientOption
function withWebSocketHandle(WebSocketImpl: WebSocketHandleConstructor): ClientOption
```

Fetch（HTTP/SSE）または WebSocket コンストラクタを差し替えます。

### withCredentials() {#withCredentials}

```ts
function withCredentials(value: boolean): ClientOption
```

`true` のとき、HTTP と SSE の Fetch は `credentials: 'include'` を使います。

### withXSRF() {#withXSRF}

```ts
function withXSRF(options?: {
  cookieName?: string
  headerName?: string
  tokenProvider?: (context: { request: HttpRequest }) => string | null | undefined
}): ClientOption
```

XSRF cookie をリクエストヘッダーへコピーします。デフォルトは cookie `XSRF-TOKEN`、ヘッダー `X-XSRF-TOKEN` です。

### SSE の設定

### withSSEReconnect() {#withSSEReconnect}

### withSSEOnInvalidEvent() {#withSSEOnInvalidEvent}

```ts
function withSSEHandle(fetchImpl: typeof fetch): ClientOption
function withSSEReconnect(options: ClientSSEOptions['reconnect']): ClientOption
function withSSEOnInvalidEvent(handler: ClientSSEOptions['onInvalidEvent']): ClientOption
```

### WebSocket の設定

### withWebSocketBeforeConnect() {#withWebSocketBeforeConnect}

### withWebSocketProtocols() {#withWebSocketProtocols}

### withWebSocketHeartbeat() {#withWebSocketHeartbeat}

### withWebSocketReconnect() {#withWebSocketReconnect}

```ts
function withWebSocketHandle(WebSocketImpl: WebSocketHandleConstructor): ClientOption
function withWebSocketBeforeConnect(beforeConnect: ClientWebSocketOptions['beforeConnect']): ClientOption
function withWebSocketProtocols(protocols: readonly string[]): ClientOption
function withWebSocketHeartbeat(options: ClientWebSocketOptions['heartbeat']): ClientOption
function withWebSocketReconnect(options: ClientWebSocketOptions['reconnect']): ClientOption
```

## 型

### Client {#Client}

```ts
type Client = {
  execute(command: HttpCommand, options?: HttpExecuteOptions): Promise<HttpAwaitResult>
  execute(command: EventStreamCommand, options?: EventStreamExecuteOptions): Promise<StreamAwaitResult>
  execute(command: WebSocketCommand, options?: WebSocketExecuteOptions): Promise<SocketAwaitResult>
}
```

### ClientOption {#ClientOption}

```ts
type ClientOption = (config: ClientConfig) => void
```

### QueryParamsSerializer {#QueryParamsSerializer}

```ts
type QueryParamsSerializer = (params: URLSearchParams, rawParams?: { [key: string]: unknown }) => string
```

### ClientSSEOptions {#ClientSSEOptions}

### ClientWebSocketOptions {#ClientWebSocketOptions}

SSE は `handle`、`onInvalidEvent`、`reconnect`（`attempts`、`delayMs`、`factor`、`jitter`、`maxDelayMs`、`shouldReconnect`）です。

WebSocket は `handle`、`beforeConnect`、`heartbeat`（`intervalMs`、`message`、`isAck`、`timeoutMs`）、`protocols`、`reconnect`（SSE と同じ形に、close の `code` / `reason` / `wasClean`）です。

`ClientConfig` は解決済みスナップショット（`endpoint`、`http`、`sse`、`webSocket`、`interceptors`、…）です。`ClientOptions` は入力側の形です。

[Client ガイド](../core/client.md) を見てください。

## ClientOptions {#ClientOptions}

入力側の config です。`endpoint`、`http`、`sse`、`webSocket`、`interceptors`…

## ClientConfig {#ClientConfig}

option helpers を当てたあとのスナップショットです。

## ClientSSEConfig {#ClientSSEConfig}

`ClientConfig.sse` に載っている、解決済みの SSE config です。

## WebSocketHandle {#WebSocketHandle}

トランスポートが触る、最小限の WebSocket インスタンス面です。

## WebSocketHandleConstructor {#WebSocketHandleConstructor}

`withWebSocketHandle` に渡すコンストラクタです。

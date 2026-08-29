---
title: 클라이언트
description: createClient, 옵션 헬퍼, Client 타입이에요.
---

# 클라이언트

클라이언트를 만들고, 옵션을 왼쪽에서 오른쪽으로 조합한 뒤 HTTP / SSE / WebSocket 명령을 `execute` 해요.

## createClient() {#createClient}

```ts
function createClient(...options: ClientOption[]): Client
```

옵션은 순서대로 적용돼요. 인터셉터가 인증이나 테넌트를 담을 때는 요청 경계 안에서 클라이언트를 만들어요.

- **options** — `withEndpoint` 같은 옵션 헬퍼예요.
- **Returns** 전송마다 `execute`가 오버로드된 클라이언트예요.

```ts
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

## option 헬퍼

### withEndpoint() {#withEndpoint}

```ts
function withEndpoint(endpoint: string): ClientOption
```

상대 path 앞에 붙는 base URL을 설정해요.

### withInterceptors() {#withInterceptors}

```ts
function withInterceptors(...interceptors: Interceptor[]): ClientOption
```

등록 순서대로 인터셉터를 추가해요. 혼합 kind는 실행 시점에 전송별로 걸러져요.

### withQueryParamsSerializer() {#withQueryParamsSerializer}

```ts
function withQueryParamsSerializer(serializer: QueryParamsSerializer): ClientOption
```

query 인코딩을 교체해요. `serializer(params, rawParams?)`는 앞에 `?` 없이 query 문자열을 돌려줘야 해요.

### withHTTPHandle() {#withHTTPHandle}

### withSSEHandle() {#withSSEHandle}

### withWebSocketHandle() {#withWebSocketHandle}

```ts
function withHTTPHandle(fetchImpl: typeof fetch): ClientOption
function withSSEHandle(fetchImpl: typeof fetch): ClientOption
function withWebSocketHandle(WebSocketImpl: WebSocketHandleConstructor): ClientOption
```

Fetch(HTTP/SSE)나 WebSocket 생성자를 교체해요.

### withCredentials() {#withCredentials}

```ts
function withCredentials(value: boolean): ClientOption
```

`true`이면 HTTP와 SSE에서 Fetch가 `credentials: 'include'`를 써요.

### withXSRF() {#withXSRF}

```ts
function withXSRF(options?: {
  cookieName?: string
  headerName?: string
  tokenProvider?: (context: { request: HttpRequest }) => string | null | undefined
}): ClientOption
```

XSRF 쿠키를 요청 헤더로 복사해요. 기본값: 쿠키 `XSRF-TOKEN`, 헤더 `X-XSRF-TOKEN`.

### SSE 설정

### withSSEReconnect() {#withSSEReconnect}

### withSSEOnInvalidEvent() {#withSSEOnInvalidEvent}

```ts
function withSSEHandle(fetchImpl: typeof fetch): ClientOption
function withSSEReconnect(options: ClientSSEOptions['reconnect']): ClientOption
function withSSEOnInvalidEvent(handler: ClientSSEOptions['onInvalidEvent']): ClientOption
```

### WebSocket 설정

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

## 타입

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

SSE: `handle`, `onInvalidEvent`, `reconnect` (`attempts`, `delayMs`, `factor`, `jitter`, `maxDelayMs`, `shouldReconnect`)예요.

WebSocket: `handle`, `beforeConnect`, `heartbeat` (`intervalMs`, `message`, `isAck`, `timeoutMs`), `protocols`, `reconnect` (SSE와 같은 형태에 close `code` / `reason` / `wasClean`)예요.

`ClientConfig`는 해석된 스냅샷이에요 (`endpoint`, `http`, `sse`, `webSocket`, `interceptors`, …). `ClientOptions`는 입력 형태의 짝이에요.

자세한 내용은 [클라이언트 가이드](../core/client.md)를 보세요.

## ClientOptions {#ClientOptions}

입력 모양 config예요. `endpoint`, `http`, `sse`, `webSocket`, `interceptors`…

## ClientConfig {#ClientConfig}

option helpers를 적용한 뒤의 스냅샷이에요.

## ClientSSEConfig {#ClientSSEConfig}

`ClientConfig.sse`에 올라간, 해석된 SSE config예요.

## WebSocketHandle {#WebSocketHandle}

전송층이 쓰는 최소 WebSocket 인스턴스 면이에요.

## WebSocketHandleConstructor {#WebSocketHandleConstructor}

`withWebSocketHandle`에 넘기는 생성자예요.

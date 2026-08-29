---
title: Client
description: createClient, Option-Helper und der Client-Type.
---

# Client {#page}

Erzeuge einen Client, komponiere Options von links nach rechts, dann `execute` HTTP- / SSE- / WebSocket-Commands.

## createClient() {#createClient}

```ts
function createClient(...options: ClientOption[]): Client
```

Options gelten in Reihenfolge. Erzeuge den Client lieber innerhalb der Request-Grenze, wenn Interceptors Auth oder Tenants closen.

- **options** — Option-Helper wie `withEndpoint`.
- **Returns** einen Client, dessen `execute` pro Transport overloaded ist.

```ts
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

## Option-Helfer

### withEndpoint() {#withEndpoint}

```ts
function withEndpoint(endpoint: string): ClientOption
```

Setzt die Base-URL, die den relativen Paths vorangestellt wird.

### withInterceptors() {#withInterceptors}

```ts
function withInterceptors(...interceptors: Interceptor[]): ClientOption
```

Hängt Interceptors in Registration-Order an. Gemischte Kinds werden zur Execute-Zeit nach Transport gefiltert.

### withQueryParamsSerializer() {#withQueryParamsSerializer}

```ts
function withQueryParamsSerializer(serializer: QueryParamsSerializer): ClientOption
```

Ersetzt Query-Encoding. `serializer(params, rawParams?)` muss den Query-String ohne führendes `?` zurückgeben.

### withHTTPHandle() {#withHTTPHandle}

### withSSEHandle() {#withSSEHandle}

### withWebSocketHandle() {#withWebSocketHandle}

```ts
function withHTTPHandle(fetchImpl: typeof fetch): ClientOption
function withSSEHandle(fetchImpl: typeof fetch): ClientOption
function withWebSocketHandle(WebSocketImpl: WebSocketHandleConstructor): ClientOption
```

Ersetzt Fetch (HTTP/SSE) oder den WebSocket-Constructor.

### withCredentials() {#withCredentials}

```ts
function withCredentials(value: boolean): ClientOption
```

Wenn `true`, nutzt Fetch `credentials: 'include'` für HTTP und SSE.

### withXSRF() {#withXSRF}

```ts
function withXSRF(options?: {
  cookieName?: string
  headerName?: string
  tokenProvider?: (context: { request: HttpRequest }) => string | null | undefined
}): ClientOption
```

Kopiert ein XSRF-Cookie auf einen Request-Header. Defaults: Cookie `XSRF-TOKEN`, Header `X-XSRF-TOKEN`.

### SSE-Optionen

### withSSEReconnect() {#withSSEReconnect}

### withSSEOnInvalidEvent() {#withSSEOnInvalidEvent}

```ts
function withSSEHandle(fetchImpl: typeof fetch): ClientOption
function withSSEReconnect(options: ClientSSEOptions['reconnect']): ClientOption
function withSSEOnInvalidEvent(handler: ClientSSEOptions['onInvalidEvent']): ClientOption
```

### WebSocket-Optionen

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

## Typen

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

SSE: `handle`, `onInvalidEvent`, `reconnect` (`attempts`, `delayMs`, `factor`, `jitter`, `maxDelayMs`, `shouldReconnect`).

WebSocket: `handle`, `beforeConnect`, `heartbeat` (`intervalMs`, `message`, `isAck`, `timeoutMs`), `protocols`, `reconnect` (gleiche Shape wie SSE plus Close `code` / `reason` / `wasClean`).

`ClientConfig` ist der resolved Snapshot (`endpoint`, `http`, `sse`, `webSocket`, `interceptors`, …). `ClientOptions` ist das input-förmige Gegenstück.

Siehe [Client-Guide](../core/client.md).

## ClientOptions {#ClientOptions}

Input-förmiges Config: `endpoint`, `http`, `sse`, `webSocket`, `interceptors`, …

## ClientConfig {#ClientConfig}

Snapshot, nachdem die Option-Helpers gelaufen sind.

## ClientSSEConfig {#ClientSSEConfig}

Aufgelöstes SSE-Config auf `ClientConfig.sse`.

## WebSocketHandle {#WebSocketHandle}

Minimale WebSocket-Instanzfläche, die der Transport anfasst.

## WebSocketHandleConstructor {#WebSocketHandleConstructor}

Konstruktor, den du an `withWebSocketHandle` übergibst.

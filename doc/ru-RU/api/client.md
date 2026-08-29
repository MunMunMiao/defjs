---
title: Клиент
description: createClient, хелперы опций и тип Client.
---

# Клиент

Собери клиент, наложи опции слева направо, потом `execute` команды HTTP / SSE / WebSocket.

## createClient() {#createClient}

```ts
function createClient(...options: ClientOption[]): Client
```

Опции применяются по порядку. Клиент лучше собирать внутри границы запроса, если interceptors замыкают auth или tenants.

- **options** — хелперы вроде `withEndpoint`.
- **Возвращает** клиент, у которого `execute` перегружен под каждый транспорт.

```ts
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

## Хелперы option

### withEndpoint() {#withEndpoint}

```ts
function withEndpoint(endpoint: string): ClientOption
```

Ставит base URL, который дописывается к относительным path.

### withInterceptors() {#withInterceptors}

```ts
function withInterceptors(...interceptors: Interceptor[]): ClientOption
```

Дописывает interceptors в порядке регистрации. Смешанные kind фильтруются по транспорту в момент execute.

### withQueryParamsSerializer() {#withQueryParamsSerializer}

```ts
function withQueryParamsSerializer(serializer: QueryParamsSerializer): ClientOption
```

Заменяет кодирование query. `serializer(params, rawParams?)` возвращает query-строку без ведущего `?`.

### withHTTPHandle() {#withHTTPHandle}

### withSSEHandle() {#withSSEHandle}

### withWebSocketHandle() {#withWebSocketHandle}

```ts
function withHTTPHandle(fetchImpl: typeof fetch): ClientOption
function withSSEHandle(fetchImpl: typeof fetch): ClientOption
function withWebSocketHandle(WebSocketImpl: WebSocketHandleConstructor): ClientOption
```

Подменяет Fetch (HTTP/SSE) или конструктор WebSocket.

### withCredentials() {#withCredentials}

```ts
function withCredentials(value: boolean): ClientOption
```

Если `true`, Fetch ставит `credentials: 'include'` для HTTP и SSE.

### withXSRF() {#withXSRF}

```ts
function withXSRF(options?: {
  cookieName?: string
  headerName?: string
  tokenProvider?: (context: { request: HttpRequest }) => string | null | undefined
}): ClientOption
```

Копирует XSRF cookie в заголовок запроса. По умолчанию: cookie `XSRF-TOKEN`, header `X-XSRF-TOKEN`.

### Настройки SSE

### withSSEReconnect() {#withSSEReconnect}

### withSSEOnInvalidEvent() {#withSSEOnInvalidEvent}

```ts
function withSSEHandle(fetchImpl: typeof fetch): ClientOption
function withSSEReconnect(options: ClientSSEOptions['reconnect']): ClientOption
function withSSEOnInvalidEvent(handler: ClientSSEOptions['onInvalidEvent']): ClientOption
```

### Настройки WebSocket

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

## Типы

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

WebSocket: `handle`, `beforeConnect`, `heartbeat` (`intervalMs`, `message`, `isAck`, `timeoutMs`), `protocols`, `reconnect` (та же форма, что у SSE, плюс close `code` / `reason` / `wasClean`).

`ClientConfig` — готовый снимок (`endpoint`, `http`, `sse`, `webSocket`, `interceptors`, …). `ClientOptions` — та же форма, но как вход.

Подробности — в [гайде Client](../core/client.md).

## ClientOptions {#ClientOptions}

Config входной формы: `endpoint`, `http`, `sse`, `webSocket`, `interceptors`, …

## ClientConfig {#ClientConfig}

Снимок после option helpers.

## ClientSSEConfig {#ClientSSEConfig}

Разобранный SSE config на `ClientConfig.sse`.

## WebSocketHandle {#WebSocketHandle}

Минимальная поверхность WebSocket-инстанса, которую трогает транспорт.

## WebSocketHandleConstructor {#WebSocketHandleConstructor}

Конструктор, который отдаёшь в `withWebSocketHandle`.

---
title: العميل
description: createClient، مساعدات الخيارات، ونوع Client.
---

# العميل

أنشئ عميلًا، ركّب الخيارات من اليسار إلى اليمين، ثم `execute` أوامر HTTP / SSE / WebSocket.

## createClient() {#createClient}

```ts
function createClient(...options: ClientOption[]): Client
```

الخيارات تُطبَّق بالترتيب. فضّل إنشاء العميل داخل حدود الطلب عندما تلتقط إغلاقات المعترض المصادقة أو المستأجرين.

- **options** — مساعدات خيارات مثل `withEndpoint`.
- **يُرجع** عميلًا `execute` فيه محمّل زائدًا حسب وسيلة النقل.

```ts
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

## مساعدات الخيارات

### withEndpoint() {#withEndpoint}

```ts
function withEndpoint(endpoint: string): ClientOption
```

يعيّن URL الأساس الذي يُلحق أمام المسارات النسبية.

### withInterceptors() {#withInterceptors}

```ts
function withInterceptors(...interceptors: Interceptor[]): ClientOption
```

يُلحق المعترضات بترتيب التسجيل. الأنواع المختلطة تُصفّى حسب وسيلة النقل عند التنفيذ.

### withQueryParamsSerializer() {#withQueryParamsSerializer}

```ts
function withQueryParamsSerializer(serializer: QueryParamsSerializer): ClientOption
```

يستبدل ترميز الاستعلام. `serializer(params, rawParams?)` يجب أن يُرجع سلسلة الاستعلام دون `?` بادئة.

### withHTTPHandle() {#withHTTPHandle}

### withSSEHandle() {#withSSEHandle}

### withWebSocketHandle() {#withWebSocketHandle}

```ts
function withHTTPHandle(fetchImpl: typeof fetch): ClientOption
function withSSEHandle(fetchImpl: typeof fetch): ClientOption
function withWebSocketHandle(WebSocketImpl: WebSocketHandleConstructor): ClientOption
```

استبدل Fetch (HTTP/SSE) أو مُنشئ WebSocket.

### withCredentials() {#withCredentials}

```ts
function withCredentials(value: boolean): ClientOption
```

عندما يكون `true`، يستخدم Fetch `credentials: 'include'` لـ HTTP وSSE.

### withXSRF() {#withXSRF}

```ts
function withXSRF(options?: {
  cookieName?: string
  headerName?: string
  tokenProvider?: (context: { request: HttpRequest }) => string | null | undefined
}): ClientOption
```

ينسخ ملف تعريف ارتباط XSRF إلى رأس الطلب. الافتراضي: الكوكي `XSRF-TOKEN`، الرأس `X-XSRF-TOKEN`.

### ضبط SSE

### withSSEReconnect() {#withSSEReconnect}

### withSSEOnInvalidEvent() {#withSSEOnInvalidEvent}

```ts
function withSSEHandle(fetchImpl: typeof fetch): ClientOption
function withSSEReconnect(options: ClientSSEOptions['reconnect']): ClientOption
function withSSEOnInvalidEvent(handler: ClientSSEOptions['onInvalidEvent']): ClientOption
```

### ضبط WebSocket

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

## الأنواع

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

SSE: `handle`، `onInvalidEvent`، `reconnect` (`attempts`، `delayMs`، `factor`، `jitter`، `maxDelayMs`، `shouldReconnect`).

WebSocket: `handle`، `beforeConnect`، `heartbeat` (`intervalMs`، `message`، `isAck`، `timeoutMs`)، `protocols`، `reconnect` (نفس شكل SSE إضافةً إلى `code` / `reason` / `wasClean` للإغلاق).

`ClientConfig` هي لقطة الحل (`endpoint`، `http`، `sse`، `webSocket`، `interceptors`، …). `ClientOptions` هي المقابل على شكل المدخل.

انظر [دليل العميل](../core/client.md).

## ClientOptions {#ClientOptions}

تهيئة بشكل الإدخال: `endpoint`، `http`، `sse`، `webSocket`، `interceptors`…

## ClientConfig {#ClientConfig}

لقطة بعد تطبيق مساعدات الخيارات.

## ClientSSEConfig {#ClientSSEConfig}

تهيئة SSE المحلولة على `ClientConfig.sse`.

## WebSocketHandle {#WebSocketHandle}

سطح نسخة WebSocket الأدنى الذي يستخدمه النقل.

## WebSocketHandleConstructor {#WebSocketHandleConstructor}

المُنشئ الممرَّر إلى `withWebSocketHandle`.

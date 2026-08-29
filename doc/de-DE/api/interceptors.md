---
title: Interceptors
description: HTTP-, SSE- und WebSocket-Interceptor-Constructors.
---

# Interceptors

Wrappe `next` für einen Transport. Registriere mit `withInterceptors`. Gemischte Listen werden zur Execute-Zeit nach kind gefiltert.

## createHttpInterceptor() {#createHttpInterceptor}

```ts
function createHttpInterceptor(fn: InterceptorFn): HttpInterceptor

type InterceptorFn = (req: HttpRequest, next: HttpInterceptorNext) => Promise<HttpResponse<unknown>>
type HttpInterceptorNext = (req: HttpRequest) => Promise<HttpResponse<unknown>>
```

Ruf `next(req)` auf (optional ein mutierter Request) oder short-circuite mit `makeResponse`.

## createSSEInterceptor() {#createSSEInterceptor}

```ts
function createSSEInterceptor(fn: SSEInterceptorFn): SSEInterceptor

type SSEHandler = (req: HttpRequest) => Promise<EventStreamHandle<unknown>>
type SSEInterceptorFn = (req: HttpRequest, next: SSEHandler) => Promise<EventStreamHandle<unknown>>
```

## createWebSocketInterceptor() {#createWebSocketInterceptor}

```ts
function createWebSocketInterceptor(fn: WebSocketInterceptorFn): WebSocketInterceptor

type WebSocketHandler = (req: HttpRequest) => Promise<WebSocketSessionLike>
type WebSocketInterceptorFn = (req: HttpRequest, next: WebSocketHandler) => Promise<WebSocketSessionLike>
```

`WebSocketSessionLike` ist die interceptor-seitige Session: `send`, `close`, `receive`, `state`, `closed`, `connection`, `bufferedAmount`, `onStateChange`, `onRuntimeError` und `[Symbol.asyncDispose](): PromiseLike<void>`. Sie erweitert `AsyncDisposable`; jeder Wrapper muss denselben Disposer weiterleiten. Eigene strukturelle Implementierungen brechen bei der Compilation, bis sie ihn ergänzen; reine Empfänger einer Defjs-Session brauchen keinen neuen Runtime-Aufruf.

## Getaggte Typen

## Interceptor {#Interceptor}

## HttpInterceptor {#HttpInterceptor}

## SSEInterceptor {#SSEInterceptor}

## WebSocketInterceptor {#WebSocketInterceptor}

```ts
type Interceptor = HttpInterceptor | SSEInterceptor | WebSocketInterceptor

interface HttpInterceptor {
  kind: 'http'
  fn: InterceptorFn
}
interface SSEInterceptor {
  kind: 'sse'
  fn: SSEInterceptorFn
}
interface WebSocketInterceptor {
  kind: 'web-socket'
  fn: WebSocketInterceptorFn
}
```

## Basic Auth

## basicAuthHttpInterceptor() {#basicAuthHttpInterceptor}

## basicAuthSSEInterceptor() {#basicAuthSSEInterceptor}

## BasicAuthInterceptorOptions {#BasicAuthInterceptorOptions}

```ts
function basicAuthHttpInterceptor(fn: () => { username: string; password: string }, options?: BasicAuthInterceptorOptions): HttpInterceptor

function basicAuthSSEInterceptor(fn: () => { username: string; password: string }, options?: BasicAuthInterceptorOptions): SSEInterceptor
```

`fn` wird pro Request aufgerufen. Optionales `encode` auf `BasicAuthInterceptorOptions` ersetzt den Default-`Basic …`-Header-Wert.

Siehe [Interceptors-Guide](../core/interceptors.md).

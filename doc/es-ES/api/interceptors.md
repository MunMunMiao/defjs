---
title: Interceptores
description: Constructores de interceptor HTTP, SSE y WebSocket.
---

# Interceptores

Envuelve `next` para un transporte. Regístralos con `withInterceptors`. Las listas mixtas se filtran por kind en el momento de execute.

## createHttpInterceptor() {#createHttpInterceptor}

```ts
function createHttpInterceptor(fn: InterceptorFn): HttpInterceptor

type InterceptorFn = (req: HttpRequest, next: HttpInterceptorNext) => Promise<HttpResponse<unknown>>
type HttpInterceptorNext = (req: HttpRequest) => Promise<HttpResponse<unknown>>
```

Llama a `next(req)` (opcionalmente una solicitud mutada) o cortocircuita con `makeResponse`.

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

`WebSocketSessionLike` es la sesión que ve el interceptor: `send`, `close`, `receive`, `state`, `closed`, `connection`, `bufferedAmount`, `onStateChange`, `onRuntimeError` y `[Symbol.asyncDispose](): PromiseLike<void>`. Extiende `AsyncDisposable`; todo wrapper debe reenviar el mismo disposer. Las implementaciones estructurales propias fallarán al compilar hasta añadirlo; quien solo recibe una sesión Defjs no necesita otra llamada runtime.

## Tipos con tag

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

## Auth básica

## basicAuthHttpInterceptor() {#basicAuthHttpInterceptor}

## basicAuthSSEInterceptor() {#basicAuthSSEInterceptor}

## BasicAuthInterceptorOptions {#BasicAuthInterceptorOptions}

```ts
function basicAuthHttpInterceptor(fn: () => { username: string; password: string }, options?: BasicAuthInterceptorOptions): HttpInterceptor

function basicAuthSSEInterceptor(fn: () => { username: string; password: string }, options?: BasicAuthInterceptorOptions): SSEInterceptor
```

`fn` se llama por solicitud. `encode` opcional en `BasicAuthInterceptorOptions` reemplaza el valor por defecto de la cabecera `Basic …`.

Ver [guía de Interceptores](../core/interceptors.md).

---
title: Intercepteurs
description: Constructeurs d’intercepteurs HTTP, SSE et WebSocket.
---

# Intercepteurs

Wrap `next` pour un transport. Enregistre-les avec `withInterceptors`. Les listes mixtes sont filtrées par kind à l’execute.

## createHttpInterceptor() {#createHttpInterceptor}

```ts
function createHttpInterceptor(fn: InterceptorFn): HttpInterceptor

type InterceptorFn = (req: HttpRequest, next: HttpInterceptorNext) => Promise<HttpResponse<unknown>>
type HttpInterceptorNext = (req: HttpRequest) => Promise<HttpResponse<unknown>>
```

Appelle `next(req)` (éventuellement une requête mutée) ou short-circuit avec `makeResponse`.

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

`WebSocketSessionLike` est la session vue par l’intercepteur : `send`, `close`, `receive`, `state`, `closed`, `connection`, `bufferedAmount`, `onStateChange`, `onRuntimeError` et `[Symbol.asyncDispose](): PromiseLike<void>`. Elle étend `AsyncDisposable` ; tout wrapper doit transférer le même disposer. Les implémentations structurelles personnalisées cassent à la compilation jusqu’à l’ajouter ; recevoir seulement une session Defjs n’ajoute aucun appel runtime.

## Types taggés

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

## Auth basic

## basicAuthHttpInterceptor() {#basicAuthHttpInterceptor}

## basicAuthSSEInterceptor() {#basicAuthSSEInterceptor}

## BasicAuthInterceptorOptions {#BasicAuthInterceptorOptions}

```ts
function basicAuthHttpInterceptor(fn: () => { username: string; password: string }, options?: BasicAuthInterceptorOptions): HttpInterceptor

function basicAuthSSEInterceptor(fn: () => { username: string; password: string }, options?: BasicAuthInterceptorOptions): SSEInterceptor
```

`fn` est appelée par requête. Un `encode` optionnel sur `BasicAuthInterceptorOptions` remplace la valeur d’en-tête `Basic …` par défaut.

Voir [le guide Intercepteurs](../core/interceptors.md).

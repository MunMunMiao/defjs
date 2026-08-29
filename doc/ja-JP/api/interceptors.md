---
title: Interceptors
description: HTTP、SSE、WebSocket のインターセプターコンストラクタです。
---

# Interceptors

1 つのトランスポート向けに `next` を包みます。`withInterceptors` で登録します。混在リストは execute 時に kind でフィルタされます。

## createHttpInterceptor() {#createHttpInterceptor}

```ts
function createHttpInterceptor(fn: InterceptorFn): HttpInterceptor

type InterceptorFn = (req: HttpRequest, next: HttpInterceptorNext) => Promise<HttpResponse<unknown>>
type HttpInterceptorNext = (req: HttpRequest) => Promise<HttpResponse<unknown>>
```

`next(req)` を呼びます（ミューテートしたリクエストでも可）。または `makeResponse` でショートサーキットします。

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

`WebSocketSessionLike` はインターセプターから見たセッションです。`send`、`close`、`receive`、`state`、`closed`、`connection`、`bufferedAmount`、`onStateChange`、`onRuntimeError`、`[Symbol.asyncDispose](): PromiseLike<void>` を持ち、`AsyncDisposable` を拡張します。wrapper は同じ disposer を転送してください。独自の構造的実装は追加するまでコンパイル時 breaking になります。Defjs session を受け取るだけなら新しい runtime 呼び出しは不要です。

## タグ付きの型

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

## Basic 認証

## basicAuthHttpInterceptor() {#basicAuthHttpInterceptor}

## basicAuthSSEInterceptor() {#basicAuthSSEInterceptor}

## BasicAuthInterceptorOptions {#BasicAuthInterceptorOptions}

```ts
function basicAuthHttpInterceptor(fn: () => { username: string; password: string }, options?: BasicAuthInterceptorOptions): HttpInterceptor

function basicAuthSSEInterceptor(fn: () => { username: string; password: string }, options?: BasicAuthInterceptorOptions): SSEInterceptor
```

`fn` はリクエストごとに呼ばれます。`BasicAuthInterceptorOptions` の任意の `encode` で、デフォルトの `Basic …` ヘッダー値を差し替えます。

[Interceptors ガイド](../core/interceptors.md) を見てください。

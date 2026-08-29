---
title: Interceptors
description: HTTP-, SSE- und WebSocket-Policy an der Transport-Grenze in Onion-Order schichten.
---

# Interceptors

Füge Auth-Headers hinzu, short-circuite Maintenance Windows oder retry safe Reads — ohne Command-Validierung anzufassen. Jeder Transport hat seine eigene Chain. Du bekommst ein `HttpRequest` rein; du gibst das Ergebnis dieses Transports zurück (`HttpResponse`, Event-Stream-Handle oder WebSocket-Session). Input-Validierung läuft vor der Chain; Status-Dispatch und dekodierte Results danach.

## Basic Setup

```typescript twoslash
import { createClient, createHttpInterceptor, withEndpoint, withInterceptors } from '@defjs/core'

const audit = createHttpInterceptor(async (request, next) => {
  const started = performance.now()
  const response = await next(request)
  console.info(request.operation ?? request.method, response.status, Math.round(performance.now() - started))
  return response
})

const client = createClient(withEndpoint('https://api.example.com'), withInterceptors(audit))
void client
```

## Onion-Order

`withInterceptors(...items)` akzeptiert gemischte Interceptors. Der Client filtert nach `kind` für den gewählten Transport und behält relative Registration-Order. Jeder Interceptor darf vor und nach `next` laufen:

| Factory                      | Request       | Result from `next`                    |
| ---------------------------- | ------------- | ------------------------------------- |
| `createHttpInterceptor`      | `HttpRequest` | `Promise<HttpResponse<unknown>>`      |
| `createSSEInterceptor`       | `HttpRequest` | `Promise<EventStreamHandle<unknown>>` |
| `createWebSocketInterceptor` | `HttpRequest` | `Promise<WebSocketSessionLike>`       |

```typescript twoslash
import { createHttpInterceptor } from '@defjs/core'

const order: string[] = []
const first = createHttpInterceptor(async (request, next) => {
  order.push('first:before')
  const response = await next(request)
  order.push('first:after')
  return response
})

const second = createHttpInterceptor(async (request, next) => {
  order.push('second:before')
  const response = await next(request)
  order.push('second:after')
  return response
})

// Request: first:before → second:before → transport
// Return: second:after → first:after
void [first, second, order]
```

Mehrere `withInterceptors(...)`-Aufrufe hängen an. Packe breite Observation außerhalb engerer Mutation/Retry, wenn der äußere Layer das finale Result sehen muss.

## Clonen und Request-Headers hinzufügen

Behandle das eingehende `HttpRequest` als Eigentum der Chain. Clone `Headers`, bevor du sie änderst; gib einen neuen Request an `next`:

```typescript twoslash
import { createHttpInterceptor } from '@defjs/core'

function readAccessToken(): string | undefined {
  return undefined
}

const bearer = createHttpInterceptor((request, next) => {
  const token = readAccessToken()
  if (!token) return next(request)

  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return next({ ...request, headers })
})
```

Dasselbe Muster für SSE. Browser-WebSocket kann keine beliebigen Handshake-Headers hinzufügen — `request.headers` zu ändern authentifiziert keinen Browser-Socket. Nutze Protocol, URL-/Query-Policy oder einen server-supported Handshake.

Wenn du einen HTTP-Body ersetzt, ersetze `body` auf dem kopierten Request. Fetch ignoriert stale Content-Type-Metadata, wenn sich der Body-Wert geändert hat. Reuse keinen consumed `ReadableStream`-Body.

## Request short-circuiten

Du kannst `next` skippen, musst aber den erwarteten Result-Type zurückgeben. Für HTTP baut `makeResponse(...)` einen kompatiblen Wrapper:

```typescript twoslash
import { createHttpInterceptor, makeResponse } from '@defjs/core'

function isMaintenanceWindow(): boolean {
  return false
}

const maintenanceGate = createHttpInterceptor(async (_request, next) => {
  if (isMaintenanceWindow()) {
    return makeResponse({
      status: 503,
      statusText: 'Service Unavailable',
      body: { message: 'Temporarily unavailable' },
    })
  }

  return next(_request)
})
```

Die Command-Layer dispatcht weiterhin nach Status. Deklariere `503` in `output`, wenn Caller typisiertes `error.data` brauchen. Short-Circuit von SSE oder WebSocket braucht ein vollständiges kompatibles Handle/Session (Closure-Promises, Live-State, Ownership). Partial Objects sind keine gültige Policy.

## Safe Reads retryen

Retries ändern Verhalten. Halte die Policy eng — dieses Beispiel retried replayable `GET` / `HEAD` / `OPTIONS` für Statuses `0`, `502`, `503`, `504`, cappt `Retry-After` bei 30s und stoppt nach zwei Retries oder bei Abort:

```typescript twoslash
import { createHttpInterceptor, type HttpRequest, type HttpResponse } from '@defjs/core'

const retryableMethods = new Set(['GET', 'HEAD', 'OPTIONS'])
const retryableStatuses = new Set([0, 502, 503, 504])

function isReplayable(request: HttpRequest): boolean {
  return typeof ReadableStream === 'undefined' || !(request.body instanceof ReadableStream)
}

function retryAfterMs(response: HttpResponse<unknown>): number {
  const value = response.headers.get('retry-after')
  if (!value) return 250

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 30_000)

  const date = Date.parse(value)
  return Number.isNaN(date) ? 250 : Math.min(Math.max(0, date - Date.now()), 30_000)
}

function waitForRetryAfter(response: HttpResponse<unknown>, signal?: AbortSignal): Promise<void> {
  const delay = retryAfterMs(response)
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }

    const timer = setTimeout(done, delay)
    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(signal?.reason)
    }

    function done() {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }

    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
  })
}

const retrySafeReads = createHttpInterceptor(async (request, next) => {
  if (!retryableMethods.has(request.method.toUpperCase()) || !isReplayable(request)) return next(request)

  for (let attempt = 0; ; attempt += 1) {
    const response = await next(request)
    if (!retryableStatuses.has(response.status) || attempt >= 2) return response
    await waitForRetryAfter(response, request.abort)
  }
})
```

Thrown Interceptor-/Fetch-Errors werden von diesem Loop nicht retried. Status `0` ist die Fetch-Boundary-Transport-Failure-Response. `POST` / `PUT` / `PATCH` / `DELETE` zu retryen braucht replayable Bytes, Server-Support, einen Idempotency-Vertrag und eine reviewed Status-Policy.

## WebSocket-Sessions wrappen

Ein WebSocket-Interceptor darf `next` höchstens einmal aufrufen. Wenn du die Session wrappst, delegiere Live-Getter und Lifecycle-Members explizit:

```typescript twoslash
import { createWebSocketInterceptor } from '@defjs/core'

const preserveSession = createWebSocketInterceptor(async (request, next) => {
  const session = await next(request)

  return {
    get bufferedAmount() {
      return session.bufferedAmount
    },
    get connection() {
      return session.connection
    },
    get state() {
      return session.state
    },
    closed: session.closed,
    receive: session.receive,
    close(code?: number, reason?: string) {
      session.close(code, reason)
    },
    [Symbol.asyncDispose]() {
      return session[Symbol.asyncDispose]()
    },
    onRuntimeError(listener) {
      return session.onRuntimeError(listener)
    },
    onStateChange(listener) {
      return session.onStateChange(listener)
    },
    send(message: unknown) {
      session.send(message)
    },
  }
})
```

Spread einer Session snapshotet `state` / `connection` / `bufferedAmount` einmal. Bewahre `closed`, `receive`, `close`, `[Symbol.asyncDispose]()` und Listener-Cleanup, außer du änderst Ownership absichtlich. Der Wrapper muss denselben inneren Disposer wie im Beispiel zurückgeben, kein separates Promise. Das ist eine Compile-Time-Breaking-Änderung für eigene strukturelle `WebSocketSessionLike`-Implementierungen; Code, der nur Defjs-Sessions empfängt, braucht keinen zusätzlichen Runtime-Aufruf.

## Reference

Factories geben tagged Transport-Values zurück:

- `createHttpInterceptor(fn)` → `{ kind: 'http', fn }`
- `createSSEInterceptor(fn)` → `{ kind: 'sse', fn }`
- `createWebSocketInterceptor(fn)` → `{ kind: 'web-socket', fn }`
- `basicAuthHttpInterceptor(provider, options?)` — Basic Credentials auf HTTP
- `basicAuthSSEInterceptor(provider, options?)` — Basic Credentials auf SSE

`HttpRequest` kann `endpoint`, `baseEndpoint`, `method`, `headers`, `body`, `queryParams`, `queryString`, `abort`, `timeout` und static `operation` enthalten. Es ist ein Transport-Integrationswert — nicht der geparste Input des Callers. Halte Command-Validierung, Output-Validierung und Domain-Error-Mapping in ihren Layern.

SSE-/WebSocket-Observer sind Lifecycle-Hooks, kein Control Flow. Unsubscribe WebSocket-Listener, wenn der Owner endet. Observer-Failures folgen dem Transport-Vertrag; ein Interceptor selbst kann throwen oder rejecten.

Logge eine reviewed Allowlist: static `operation`, Method, Status, Duration, stabiler Error-Code. Logge resolved URLs, Query Strings, Auth-Headers, Bodies, Raw Causes, SSE-Event-IDs oder WebSocket-Payloads nicht defaultmäßig.

Basic Credentials sind Base64, nicht encrypted. Nutze TLS, halte Credential-Provider request-scoped auf einem Server, logge nie den generierten Header. Default-Encoder ist `globalThis.btoa`; gib `BasicAuthInterceptorOptions.encode`, wenn die Runtime kein `btoa` hat oder einen reviewed Encoder braucht.

Ein Interceptor kann Transport-Policy erzwingen. Er ist keine Input-Validierung, Authorization oder Resource-Ownership. Code, der langlebige SSE-/WebSocket-Arbeit startet, nutzt weiterhin `await using` oder cancelt, schließt und awaitet das Terminal-Promise manuell. Normales HTTP bleibt request-scoped und wird mit Timeout / `AbortSignal` verwaltet; `Client` ist nicht `AsyncDisposable`.

## Verwandte Rezepte

- [Mit lokalem Fetch-Handle testen](../recipes/test-with-handle.md)
- [HTTP-Aufruf abbrechen](../recipes/cancel-http.md)

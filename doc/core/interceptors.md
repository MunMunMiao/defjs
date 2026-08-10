---
title: Interceptors
description: Filter interceptors by transport, compose them in onion order, clone requests safely, short-circuit work, and implement bounded auth and retry policies.
---

# Interceptors

Interceptors wrap the transport boundary. HTTP, SSE, and WebSocket each have a distinct interceptor kind and result type.

| Factory                      | Request       | Result from `next`                    |
| ---------------------------- | ------------- | ------------------------------------- |
| `createHttpInterceptor`      | `HttpRequest` | `Promise<HttpResponse<unknown>>`      |
| `createSSEInterceptor`       | `HttpRequest` | `Promise<EventStreamHandle<unknown>>` |
| `createWebSocketInterceptor` | `HttpRequest` | `Promise<WebSocketSessionLike>`       |

Register mixed interceptors with `withInterceptors(...)`. The client filters by `kind` and preserves registration order within each transport.

```typescript
const client = createClient(withEndpoint('https://api.example.com'), withInterceptors(httpLogger, sseAuth, socketObserver))
```

## Onion Order

Request flow follows registration order. Return flow unwinds in reverse:

```typescript
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

// first:before -> second:before -> transport
//               <- second:after <- first:after
```

Multiple `withInterceptors(...)` calls append:

```typescript
createClient(withInterceptors(first), withInterceptors(second, third))
```

A WebSocket interceptor may call its `next` function at most once. If the chain fails after `next` created a session, Core settles that undelivered session before returning the original interceptor error. If the chain succeeds with a different short-circuit session, Core closes the created session; a wrapper remains associated by delegating the original `closed` Promise.

## Clone Requests Safely

Treat the incoming request as owned by the chain. Create a new `Headers` object before changing headers:

```typescript
const auth = createHttpInterceptor((request, next) => {
  const token = getAccessToken()
  if (!token) {
    return next(request)
  }

  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return next({ ...request, headers })
})
```

The same pattern works for SSE headers. Browser WebSocket constructors cannot send arbitrary handshake headers, so changing `request.headers` in a WebSocket interceptor does not authenticate the browser connection.

When replacing an HTTP body, spread the request and replace `body`. The Fetch boundary detects that the old body content-type metadata no longer belongs to the new body. Do not reuse a consumed `ReadableStream` body.

## Short-Circuiting

An interceptor can skip `next`, but it must return the result type expected by its transport. For HTTP, `makeResponse(...)` can create a Defjs wrapper:

```typescript
import { createHttpInterceptor, makeResponse } from '@defjs/core'

declare const isMaintenanceWindow: () => boolean

const maintenanceGate = createHttpInterceptor(async (request, next) => {
  if (isMaintenanceWindow()) {
    return makeResponse({
      status: 503,
      statusText: 'Service Unavailable',
      body: { message: 'Temporarily unavailable' },
    })
  }

  return next(request)
})
```

The normal command layer still dispatches this response by status and output Struct. Declare the status if it is part of the endpoint contract.

Short-circuiting SSE or WebSocket requires a complete compatible handle or session, including closure semantics. That is usually more work than returning a synthetic HTTP response.

## Preserve Live Session Getters

Do not wrap a WebSocket session with `{ ...session }`. Spreading reads `state` and `connection` once and turns their live getters into stale values. Delegate every member explicitly:

```typescript
import { createWebSocketInterceptor } from '@defjs/core'

const wrappedSession = createWebSocketInterceptor(async (request, next) => {
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
    close(code, reason) {
      session.close(code, reason)
    },
    onRuntimeError(listener) {
      return session.onRuntimeError(listener)
    },
    onStateChange(listener) {
      return session.onStateChange(listener)
    },
    send(message) {
      session.send(message)
    },
  }
})
```

The wrapper must also preserve resource ownership. It must not replace `closed`, suppress `close`, or detach the incoming iterable unless that behavior is deliberate and documented by the application.

## Bounded Logging

Prefer fixed operation names and a small reviewed field set:

```typescript
function timingInterceptor(operation: string) {
  return createHttpInterceptor(async (request, next) => {
    const startedAt = performance.now()
    const response = await next(request)

    console.info('outbound request completed', {
      durationMs: Math.round(performance.now() - startedAt),
      operation,
      status: response.status,
    })

    return response
  })
}
```

Do not log endpoint URLs, query strings, headers, bodies, raw causes, SSE event IDs, or WebSocket payloads by default.

## Retry HTTP Conservatively

Retries change application behavior. The example below is limited to `GET`, `HEAD`, and `OPTIONS`; retries only status `0`, `502`, `503`, and `504`; honors `Retry-After`; stops promptly on abort; and refuses a stream body.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpResponse } from '@defjs/core'

const RETRYABLE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const RETRYABLE_STATUSES = new Set([0, 502, 503, 504])

function isReplayable(request: HttpRequest): boolean {
  return !(typeof ReadableStream !== 'undefined' && request.body instanceof ReadableStream)
}

function retryAfterMs(response: HttpResponse<unknown>): number | undefined {
  const value = response.headers.get('retry-after')
  if (!value) {
    return undefined
  }

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000
  }

  const at = Date.parse(value)
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now())
}

async function abortableWait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw signal.reason
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(finish, ms)

    function finish() {
      signal?.removeEventListener('abort', abort)
      resolve()
    }

    function abort() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      reject(signal?.reason)
    }

    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) {
      abort()
    }
  })
}

function retrySafeHttp(maxRetries = 2) {
  return createHttpInterceptor(async (request, next) => {
    if (!RETRYABLE_METHODS.has(request.method.toUpperCase()) || !isReplayable(request)) {
      return next(request)
    }

    for (let retry = 0; ; retry += 1) {
      const response = await next(request)
      if (!RETRYABLE_STATUSES.has(response.status) || retry >= maxRetries) {
        return response
      }

      const fallback = Math.min(250 * 2 ** retry, 5_000)
      const delay = Math.min(retryAfterMs(response) ?? fallback, 30_000)
      await abortableWait(delay, request.abort)
    }
  })
}
```

This interceptor does not retry thrown interceptor errors because it cannot classify them safely. Status `0` is the Defjs Fetch boundary's transport-failure wrapper.

Do not expand the method set to writes by habit. Retrying `POST`, `PUT`, `PATCH`, or `DELETE` requires an application-level idempotency contract, replayable bodies, server support, and a reviewed status policy.

## Basic Authentication

The root entry exports `basicAuthHttpInterceptor(...)` and `basicAuthSSEInterceptor(...)`.

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(
    basicAuthHttpInterceptor(() => credentials),
    basicAuthSSEInterceptor(() => credentials),
  ),
)
```

Basic credentials are only base64-encoded, not encrypted. Use TLS. The default encoder uses `globalThis.btoa`, which may be unavailable and only accepts a limited character range. Pass `options.encode` when the runtime lacks `btoa` or credentials require a reviewed UTF-8/base64 implementation.

Credential providers run when a request passes through the interceptor. Keep server credentials request-scoped, and do not log the resulting header.

## Observer and Callback Safety

SSE and WebSocket interceptors can attach lifecycle observers to returned handles. Unsubscribe WebSocket listeners when their owner ends. WebSocket isolates a state-listener failure through runtime-error observers, forwards a failing runtime-error observer to `reportError`, and treats a thrown reconnect predicate as a terminal session error.

An interceptor can throw or reject. The high-level transport may normalize some failures into a `RequestError`, but interceptor code should not depend on a blanket never-reject guarantee.

## Next

- [Client](/core/client) explains registration and option composition.
- [HTTP](/core/http) documents the Fetch wrapper and status-0 behavior.
- [SSE](/core/sse) and [WebSocket](/core/web-socket) own transport lifecycle details.

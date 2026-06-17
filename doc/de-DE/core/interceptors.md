---
title: Interceptors
description: Per-transport HTTP, SSE, and WebSocket interceptors, onion-chain execution model, and common interceptor examples.
---

# Interceptors

`@defjs/core`-Interceptors sind nach Transport-Layer aufgeteilt: HTTP, SSE und WebSocket. Sie teilen sich dasselbe Zwiebelketten-Ausführungsmodell, handhaben aber unterschiedliche Request/Response-Formen: HTTP gibt `Promise<HttpResponse>` zurück, SSE gibt `Promise<EventStreamHandle>` zurück und WebSocket gibt `Promise<WebSocketSessionLike>` zurück.

Interceptors werden auf `Client`-Ebene über `withInterceptors(...)` registriert. Der Client filtert und verteilt automatisch an die korrekte Interceptor-Kette basierend auf dem Command-Typ.

## Drei Interceptor-Typen

### HTTP-Interceptors

HTTP-Interceptors arbeiten auf `HttpRequest` und geben `Promise<HttpResponse>` zurück. Typischer Einsatz: Auth-Headers injizieren, Logging, Retry, Fehlertransformation.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpResponse, HttpInterceptorNext } from '@defjs/core'

const loggingInterceptor = createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
  console.log(`[HTTP] ${req.method} ${req.endpoint}`)
  const response = await next(req)
  console.log(`[HTTP] ${req.method} ${req.endpoint} -> ${response.status}`)
  return response
})
```

### SSE-Interceptors

SSE-Interceptors arbeiten auf `HttpRequest` (der HTTP-Request vor Verbindung) und geben `Promise<EventStreamHandle>` zurück. Typischer Einsatz: Auth-Headers vor SSE-Verbindung injizieren, Verbindungszustand überwachen.

```typescript
import { createSSEInterceptor } from '@defjs/core'
import type { HttpRequest, SSEHandler } from '@defjs/core'

const sseAuthInterceptor = createSSEInterceptor(async (req: HttpRequest, next: SSEHandler) => {
  const headers = new Headers(req.headers)
  headers.set('Authorization', `Bearer ${getToken()}`)
  const stream = await next({ ...req, headers })
  return stream
})
```

### WebSocket-Interceptors

WebSocket-Interceptors arbeiten auf `HttpRequest` (der HTTP-Request vor Handshake) und geben `Promise<WebSocketSessionLike>` zurück. Typischer Einsatz: URL modifizieren oder Subprotokoll-Headers vor WebSocket-Handshake injizieren.

```typescript
import { createWebSocketInterceptor } from '@defjs/core'
import type { HttpRequest, WebSocketHandler } from '@defjs/core'

const wsProtocolInterceptor = createWebSocketInterceptor(async (req: HttpRequest, next: WebSocketHandler) => {
  const headers = new Headers(req.headers)
  headers.set('Sec-WebSocket-Protocol', 'v1')
  const session = await next({ ...req, headers })
  return session
})
```

## Zwiebelketten-Ausführungsmodell

Alle drei Interceptor-Ketten verwenden das **Zwiebelmodell**: Request-Phase betritt in Registrierungsreihenfolge, Response-Phase kehrt in umgekehrter Reihenfolge zurück.

```typescript
import { createHttpInterceptor, makeInterceptorChain } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext, HttpResponse } from '@defjs/core'

const order: number[] = []

const a = createHttpInterceptor(async (req, next) => {
  order.push(1) // Request phase: first in
  const res = await next(req)
  order.push(1.1) // Response phase: last out
  return res
})

const b = createHttpInterceptor(async (req, next) => {
  order.push(2)
  const res = await next(req)
  order.push(2.1)
  return res
})

const c = createHttpInterceptor(async (req, next) => {
  order.push(3) // Request phase: last in
  const res = await next(req)
  order.push(3.1) // Response phase: first out
  return res
})

// Registration order: a -> b -> c
// Execution order: 1 -> 2 -> 3 -> 3.1 -> 2.1 -> 1.1
```

### Requests und Responses modifizieren

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext } from '@defjs/core'

const addHeaderInterceptor = createHttpInterceptor(async (req, next) => {
  const headers = new Headers(req.headers)
  headers.set('X-Request-Id', crypto.randomUUID())
  return next({ ...req, headers })
})

const wrapErrorInterceptor = createHttpInterceptor(async (req, next) => {
  try {
    return await next(req)
  } catch (error) {
    throw new Error(`Request failed: ${error}`)
  }
})
```

### Rückgabergebnisse wrappen

```typescript
import { createWebSocketInterceptor } from '@defjs/core'
import type { WebSocketInterceptorFn } from '@defjs/core'

const wrapSessionInterceptor: WebSocketInterceptorFn = async (req, next) => {
  const session = await next(req)
  return {
    ...session,
    send(message: unknown) {
      console.log('[WS] send:', message)
      session.send(message)
    },
  }
}
```

## Häufige Interceptor-Beispiele

### Auth-Interceptor

Bearer Token in Headers injizieren. HTTP und SSE teilen dieselbe Logik.

```typescript
import { createHttpInterceptor, createSSEInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext } from '@defjs/core'

function getToken(): string {
  return localStorage.getItem('token') ?? ''
}

const authHttpInterceptor = createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
  const headers = new Headers(req.headers)
  headers.set('Authorization', `Bearer ${getToken()}`)
  return next({ ...req, headers })
})

const authSSEInterceptor = createSSEInterceptor(async (req, next) => {
  const headers = new Headers(req.headers)
  headers.set('Authorization', `Bearer ${getToken()}`)
  return next({ ...req, headers })
})
```

### Logging-Interceptor

Request-Dauer und Statuscode aufzeichnen.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext } from '@defjs/core'

const timingInterceptor = createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
  const start = performance.now()
  const response = await next(req)
  const duration = (performance.now() - start).toFixed(2)
  console.log(`[${duration}ms] ${req.method} ${req.endpoint} ${response.status}`)
  return response
})
```

### Retry-Interceptor

Spezifische Statuscodes wiederholen. Der Retry-Interceptor sollte nahe dem Ende der Kette registriert werden, nach Logging aber vor dem eigentlichen Request.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext, HttpResponse } from '@defjs/core'

function retryInterceptor(maxRetries = 3, delayMs = 1000) {
  return createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
    let lastError: unknown

    for (let i = 0; i <= maxRetries; i++) {
      try {
        const response = await next(req)
        if (response.status >= 500) {
          lastError = new Error(`Server error: ${response.status}`)
          if (i < maxRetries) {
            await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
            continue
          }
        }
        return response
      } catch (error) {
        lastError = error
        if (i < maxRetries) {
          await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
          continue
        }
      }
    }

    throw lastError
  })
}
```

### Basic-Auth-Interceptor (Built-in)

`@defjs/core` bietet eingebaute Basic-Auth-Interceptors für HTTP und SSE.

```typescript
import { basicAuthHttpInterceptor, basicAuthSSEInterceptor } from '@defjs/core'

const credential = () => ({ username: 'admin', password: 'secret' })

const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(basicAuthHttpInterceptor(credential), basicAuthSSEInterceptor(credential)),
)
```

Default-Kodierung verwendet `globalThis.btoa`. Für Umgebungen ohne `btoa` (z. B. Node) kann über `options.encode` angepasst werden:

```typescript
import { basicAuthHttpInterceptor } from '@defjs/core'

const interceptor = basicAuthHttpInterceptor(() => ({ username: 'user', password: 'pass' }), {
  encode: (cred) => Buffer.from(`${cred.username}:${cred.password}`).toString('base64'),
})
```

## Registrierung und Filterung

### Registrierung über `withInterceptors`

Interceptors werden bei `createClient` über `withInterceptors(...)` registriert. Das gleiche Array kann alle drei Interceptor-Typen mischen; der Client filtert automatisch nach Command-Typ.

```typescript
import { createClient, withEndpoint, withInterceptors } from '@defjs/core'
import { createHttpInterceptor, createSSEInterceptor, createWebSocketInterceptor } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(
    createHttpInterceptor(async (req, next) => {
      console.log('HTTP:', req.endpoint)
      return next(req)
    }),
    createSSEInterceptor(async (req, next) => {
      console.log('SSE:', req.endpoint)
      return next(req)
    }),
    createWebSocketInterceptor(async (req, next) => {
      console.log('WS:', req.endpoint)
      return next(req)
    }),
  ),
)
```

### Filterregeln

Der Client filtert Interceptors nach Command-Typ:

| Command-Typ                   | Filterbedingung         | Interne Funktion               |
| ----------------------------- | ----------------------- | ------------------------------ |
| HTTP (`defineRequest`)        | `kind === 'http'`       | `resolveHttpInterceptors`      |
| SSE (`defineEventStream`)     | `kind === 'sse'`        | `resolveSSEInterceptors`       |
| WebSocket (`defineWebSocket`) | `kind === 'web-socket'` | `resolveWebSocketInterceptors` |

Gefilterte Interceptors behalten ihre ursprüngliche Registrierungsreihenfolge, dann formen sie eine Zwiebelkette.

```typescript
// Vereinfachte interne Ausführungslogik
const httpInterceptors = resolveHttpInterceptors(clientConfig.interceptors)
const chain = makeInterceptorChain(httpInterceptors)
const response = await chain(request, (req) => fetchHandler(req, clientConfig.http.fetch))
```

### Interceptor-Reihenfolge und Komposition

Mehrere `withInterceptors`-Aufrufe hängen Interceptors in Reihenfolge an.

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(loggingInterceptor), // First
  withInterceptors(authInterceptor, retryInterceptor), // Second
)
// Final order: logging -> auth -> retry
```

## Body-Metadata-Hinweise

Falls ein Interceptor den `body` ersetzt, wird die alte `bodyContentType`-Metadata automatisch invalidiert, um zu verhindern, dass ein inkorrekter `Content-Type` an den Server gesendet wird.

```typescript
// Originalen Body beibehalten: Content-Type-Metadata bleibt gültig
const keepBody = createHttpInterceptor((req, next) => next({ ...req, headers: new Headers(req.headers) }))

// Body ersetzen: alter Content-Type wird gelöscht, neuer Body-Typ bestimmt ihn
const replaceBody = createHttpInterceptor((req, next) => next({ ...req, body: new FormData() }))
```

## API-Referenz

### Erstellungsfunktionen

| Funktion                         | Beschreibung                    |
| -------------------------------- | ------------------------------- |
| `createHttpInterceptor(fn)`      | HTTP-Interceptor erstellen      |
| `createSSEInterceptor(fn)`       | SSE-Interceptor erstellen       |
| `createWebSocketInterceptor(fn)` | WebSocket-Interceptor erstellen |

### Typen

| Typ                    | Beschreibung                                                                      |
| ---------------------- | --------------------------------------------------------------------------------- |
| `HttpInterceptor`      | HTTP-Interceptor-Objekt `{ kind: 'http', fn: InterceptorFn }`                     |
| `SSEInterceptor`       | SSE-Interceptor-Objekt `{ kind: 'sse', fn: SSEInterceptorFn }`                    |
| `WebSocketInterceptor` | WebSocket-Interceptor-Objekt `{ kind: 'web-socket', fn: WebSocketInterceptorFn }` |
| `Interceptor`          | Union aller drei Interceptor-Typen                                                |
| `HttpInterceptorNext`  | HTTP-Next-Handler `(req: HttpRequest) => Promise<HttpResponse>`                   |
| `SSEHandler`           | SSE-Next-Handler `(req: HttpRequest) => Promise<EventStreamHandle>`               |
| `WebSocketHandler`     | WebSocket-Next-Handler `(req: HttpRequest) => Promise<WebSocketSessionLike>`      |

### Built-in-Interceptors

| Funktion                                         | Beschreibung                |
| ------------------------------------------------ | --------------------------- |
| `basicAuthHttpInterceptor(credential, options?)` | HTTP-Basic-Auth-Interceptor |
| `basicAuthSSEInterceptor(credential, options?)`  | SSE-Basic-Auth-Interceptor  |

## Wie geht es weiter

- [Client →](/core/client) — Clients erstellen und Interceptors konfigurieren
- [HTTP Requests →](/core/http) — `defineRequest` und Output-Patterns
- [SSE →](/core/sse) — SSE-Definition und Streaming
- [WebSocket →](/core/web-socket) — WebSocket-Definition und Lifecycle

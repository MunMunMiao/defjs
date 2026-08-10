---
title: Interceptors
description: Filtere Interceptors nach Transport, kombiniere sie in Onion-Reihenfolge, kopiere Requests sicher, beende Ketten früh und implementiere begrenzte Auth- und Retry-Richtlinien.
---

# Interceptors

Interceptors umschließen die Transportgrenze. HTTP, SSE und WebSocket haben jeweils einen eigenen Interceptor-Typ und Ergebnistyp.

| Factory                      | Request       | Ergebnis von `next`                   |
| ---------------------------- | ------------- | ------------------------------------- |
| `createHttpInterceptor`      | `HttpRequest` | `Promise<HttpResponse<unknown>>`      |
| `createSSEInterceptor`       | `HttpRequest` | `Promise<EventStreamHandle<unknown>>` |
| `createWebSocketInterceptor` | `HttpRequest` | `Promise<WebSocketSessionLike>`       |

Registriere gemischte Interceptors mit `withInterceptors(...)`. Der Client filtert nach `kind` und behält innerhalb jedes Transports die Registrierungsreihenfolge bei.

```typescript
const client = createClient(withEndpoint('https://api.example.com'), withInterceptors(httpLogger, sseAuth, socketObserver))
```

## Onion-Reihenfolge

Der Request läuft in Registrierungsreihenfolge durch die Kette. Beim Rückweg wird die Reihenfolge umgekehrt:

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

Mehrere Aufrufe von `withInterceptors(...)` hängen Einträge an:

```typescript
createClient(withInterceptors(first), withInterceptors(second, third))
```

Ein WebSocket-Interceptor darf `next` höchstens einmal aufrufen. Scheitert die Chain nach dem Erzeugen einer Session, erfüllt Core diese nicht ausgelieferte Session, bevor der ursprüngliche Interceptorfehler zurückkehrt. Liefert die Chain erfolgreich eine andere Short-Circuit-Session, schließt Core die erzeugte Session; ein Wrapper bleibt durch Delegation der ursprünglichen `closed`-Promise zugeordnet.

## Requests sicher kopieren

Behandle den eingehenden Request als Eigentum der Kette. Erzeuge ein neues `Headers`-Objekt, bevor du Header änderst:

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

Dasselbe Muster gilt für SSE-Header. Browser-WebSocket-Konstruktoren können keine beliebigen Handshake-Header senden. Eine Änderung von `request.headers` in einem WebSocket-Interceptor authentifiziert deshalb keine Browserverbindung.

Wenn du einen HTTP-Body ersetzt, kopiere den Request und ersetze `body`. Die Fetch-Grenze erkennt, dass die alten Content-Type-Metadaten nicht mehr zum neuen Body gehören. Verwende keinen bereits konsumierten `ReadableStream`-Body erneut.

## Short-Circuiting

Ein Interceptor kann `next` überspringen, muss aber den Ergebnistyp seines Transports zurückgeben. Für HTTP kann `makeResponse(...)` einen Defjs-Wrapper erzeugen:

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

Die normale Command-Ebene ordnet auch diese Response anhand von Status und Output-Struct zu. Deklariere den Status, wenn er zum Endpunktvertrag gehört.

Ein Short-Circuit für SSE oder WebSocket benötigt einen vollständigen kompatiblen Handle oder eine Session einschließlich Schließsemantik. Das ist meist aufwendiger als eine synthetische HTTP-Response.

## Live-Getter einer Session erhalten

Umschließe eine WebSocket-Session nicht mit `{ ...session }`. Beim Spread werden `state` und `connection` einmal gelesen und ihre Live-Getter in veraltete Werte verwandelt. Delegiere jedes Member ausdrücklich:

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

Der Wrapper muss auch die Zuständigkeit für Ressourcen bewahren. Er darf `closed` nicht ersetzen, `close` nicht unterdrücken und das eingehende Iterable nicht abkoppeln, sofern die Anwendung dieses Verhalten nicht bewusst vorsieht und dokumentiert.

## Begrenztes Logging

Bevorzuge feste Operationsnamen und eine kleine geprüfte Feldauswahl:

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

Logge standardmäßig keine Endpunkt-URLs, Query-Strings, Header, Bodies, rohen Ursachen, SSE-Event-IDs oder WebSocket-Payloads.

## HTTP vorsichtig wiederholen

Retries ändern das Verhalten der Anwendung. Das folgende Beispiel beschränkt sich auf `GET`, `HEAD` und `OPTIONS`, wiederholt nur Status `0`, `502`, `503` und `504`, berücksichtigt `Retry-After`, reagiert zügig auf Abbruch und lehnt Stream-Bodies ab.

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

Dieser Interceptor wiederholt keine geworfenen Interceptor-Fehler, weil er sie nicht verlässlich klassifizieren kann. Status `0` ist der Wrapper für Transportfehler an der Defjs-Fetch-Grenze.

Erweitere die Methodenliste nicht beiläufig um schreibende Requests. Ein Retry von `POST`, `PUT`, `PATCH` oder `DELETE` braucht einen fachlichen Idempotenzvertrag, wiederholbare Bodies, Serverunterstützung und eine geprüfte Statusrichtlinie.

## Basic Authentication

Der zentrale Paketeinstieg exportiert `basicAuthHttpInterceptor(...)` und `basicAuthSSEInterceptor(...)`.

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(
    basicAuthHttpInterceptor(() => credentials),
    basicAuthSSEInterceptor(() => credentials),
  ),
)
```

Basic-Credentials werden nur Base64-kodiert, nicht verschlüsselt. Verwende TLS. Der Standardencoder nutzt `globalThis.btoa`, das fehlen kann und nur einen begrenzten Zeichenbereich akzeptiert. Übergib `options.encode`, wenn die Runtime kein `btoa` bereitstellt oder die Credentials eine geprüfte UTF-8/Base64-Implementierung benötigen.

Credential-Provider laufen, sobald ein Request den Interceptor durchläuft. Halte Server-Credentials Request-bezogen und logge den resultierenden Header nicht.

## Sicherheit von Beobachtern und Callbacks

SSE- und WebSocket-Interceptors können Lebenszyklusbeobachter an zurückgegebene Handles hängen. Entferne WebSocket-Listener, wenn ihr Besitzer endet. WebSocket leitet den Fehler eines Zustandslisteners an Laufzeitfehlerbeobachter weiter, meldet einen fehlerhaften Laufzeitfehlerbeobachter über `reportError` und behandelt ein werfendes Reconnect-Prädikat als terminalen Sessionfehler.

Ein Interceptor kann werfen oder eine Promise ablehnen. Der High-Level-Transport normalisiert manche Fehler zu einem `RequestError`, Interceptor-Code sollte sich aber nicht auf eine pauschale Garantie verlassen, dass nie eine Promise abgelehnt wird.

## Weiter

- [Client](/de-DE/core/client) erklärt Registrierung und Optionskomposition.
- [HTTP](/de-DE/core/http) dokumentiert den Fetch-Wrapper und Verhalten bei Status 0.
- [SSE](/de-DE/core/sse) und [WebSocket](/de-DE/core/web-socket) beschreiben ihre jeweiligen Lebenszyklen.

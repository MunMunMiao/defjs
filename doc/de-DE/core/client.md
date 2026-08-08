---
title: Client
description: Erstelle explizite Clients, kombiniere Optionen, führe transportspezifische Commands aus und untersuche die Live-Konfiguration.
---

# Client

Erstelle einen `Client` explizit und übergib ihn an den Code, der Commands ausführt.

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

Der Client speichert die Konfiguration und verteilt HTTP-, SSE- und WebSocket-Commands. Er verwaltet weder eine globale Registry noch einen Lebenszyklus im Hintergrund.

## Optionskomposition

Optionen werden von links nach rechts ausgeführt.

```typescript
const client = createClient(
  withEndpoint('https://old.example.com'),
  withEndpoint('https://api.example.com'),
  withInterceptors(operationLogger),
  withInterceptors(authInterceptor, retryInterceptor),
)
```

Der endgültige Endpunkt ist `https://api.example.com`. Die Reihenfolge der Interceptors lautet `operationLogger`, `authInterceptor`, dann `retryInterceptor`.

Für die Komposition gelten drei Regeln:

1. Setter-Helper ersetzen ihren Wert. Dazu gehören `withEndpoint`, Transport-Handles, der Query-Serializer, Credentials, die XSRF-Konfiguration und einzelne SSE- oder WebSocket-Einstellungen.
2. `withInterceptors(...items)` hängt Einträge an. Mehrere Aufrufe bewahren die Reihenfolge, in der Interceptors hinzugefügt wurden.
3. `withSSEOptions(...)` und `withWebSocketOptions(...)` ersetzen jedes definierte Feld auf oberster Ebene flach. Verschachtelte Reconnect-, Heartbeat- oder Queue-Objekte werden nicht tief zusammengeführt.

Im folgenden Beispiel ersetzt das zweite Reconnect-Objekt das erste vollständig. `attempts: 5` bleibt nicht erhalten.

```typescript
const client = createClient(
  withWebSocketOptions({
    reconnect: { attempts: 5, delayMs: 500 },
  }),
  withWebSocketOptions({
    reconnect: { delayMs: 2_000 },
  }),
)
```

Die gruppierten Options-Helper ignorieren Eigenschaften mit dem Wert `undefined`. Jede andere angegebene Eigenschaft auf oberster Ebene ersetzt den bisherigen Wert als Ganzes.

### Core-Optionen

| Option                           | Wirkung                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `withEndpoint(url)`              | Setzt den absoluten Basisendpunkt für alle Transports.                           |
| `withHTTPHandle(fetch)`          | Ersetzt die Fetch-Implementierung für HTTP.                                      |
| `withSSEHandle(fetch)`           | Ersetzt die Fetch-Implementierung für SSE.                                       |
| `withWebSocketHandle(WebSocket)` | Ersetzt den WebSocket-Konstruktor.                                               |
| `withInterceptors(...items)`     | Hängt gemischte Transport-Interceptors an.                                       |
| `withQueryParamsSerializer(fn)`  | Ersetzt die Serialisierung von Query-Parametern für HTTP, SSE und WebSocket.     |
| `withCredentials(boolean)`       | Verwendet bei `true` für HTTP und SSE die Fetch-Option `credentials: 'include'`. |
| `withXSRF(options?)`             | Konfiguriert die HTTP-XSRF-Token-Injektion.                                      |
| `withSSEOptions(options)`        | Ersetzt definierte SSE-Felder flach.                                             |
| `withWebSocketOptions(options)`  | Ersetzt definierte WebSocket-Felder flach.                                       |

Einzelne SSE- und WebSocket-Helper setzen jeweils ein zugehöriges Feld auf oberster Ebene. Die Transportseiten nennen Standardwerte und Auswirkungen auf den Lebenszyklus.

## Commands ausführen

`Client.execute` hat drei Overloads. Jeder liefert ein fehlerorientiertes Drei-Elemente-Tupel.

### HTTP

```typescript
const [error, data, response] = await client.execute(requestCommand, {
  signal,
  timeout: 5_000,
})
```

Das dritte Element ist ein Defjs-`SettledResponse`-Wrapper, sofern eine Response verfügbar ist. Zu den HTTP-Optionen gehören `abort` oder `timeout`, der zusätzliche Alias `signal`, `context` sowie Beobachter für Upload- und Download-Fortschritt.

### SSE

```typescript
const [error, stream, startupOpen] = await client.execute(streamCommand, {
  signal,
})
```

Das dritte Element ist der validierte Snapshot der beim Start geöffneten Verbindung. `stream.open` ist ein separater Live-Getter und kann sich nach Reconnect-Versuchen ändern. Die SSE-Ausführung akzeptiert Abbruch und `HttpContext`; Reconnect und Eventwarteschlange sind Clientoptionen.

### WebSocket

```typescript
const [error, session, startupConnection] = await client.execute(socketCommand, {
  signal,
  reconnect: { attempts: 3 },
})
```

Das dritte Element ist der Verbindungs-Snapshot vom Start. `session.connection` ist ein Live-Getter und kann einen späteren physischen Verbindungsversuch beschreiben. Die WebSocket-Ausführung akzeptiert Abbruch sowie `beforeConnect`, `heartbeat`, `protocols`, `queue` und `reconnect` pro Ausführung. Sie akzeptiert keinen `HttpContext`.

Die genauen Fehlerzweige stehen unter [Fehler](/de-DE/core/errors). [HTTP](/de-DE/core/http), [SSE](/de-DE/core/sse) und [WebSocket](/de-DE/core/web-socket) erklären die Lebenszyklen der Transports.

## Client-Scope

Eine Browseranwendung kann einen Client auf Modulebene behalten, wenn Endpunkt und Closures nur browsersicheren, Request-unabhängigen Zustand enthalten.

```typescript
export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

Verwende einen Server-Client nicht für mehrere Requests, wenn Optionen oder Interceptors Autorisierung, Cookies, Mandanten-, Benutzer- oder Requestdaten in Closures halten. Erzeuge ihn innerhalb der jeweiligen Server-Request-Grenze.

Ein `Client` hat keine Methode `dispose()`. Er verfolgt keine aktiven Requests, Streams oder Sessions. Der Code, der Arbeit startet, muss den HTTP-Request abbrechen, den SSE-Handle schließen oder die WebSocket-Session an der passenden Lebenszyklusgrenze beenden.

## Client-Konfiguration prüfen

Mit `isClient(value)` prüfst du zur Laufzeit den Client-Marker.

```typescript
import { isClient } from '@defjs/core'

export function keepClient(value: unknown) {
  return isClient(value) ? value : undefined
}
```

`getClientConfig(client)` gibt das live verwendete, veränderbare Konfigurationsobjekt des Clients zurück. Es ist weder ein Snapshot noch eine readonly Ansicht.

```typescript
import { getClientConfig, type Client } from '@defjs/core'

export function interceptorCount(client: Client): number {
  return getClientConfig(client).interceptors.length
}
```

Eine Mutation dieses Objekts beeinflusst spätere Ausführungen und umgeht die normale Optionskomposition. Verwende es vorzugsweise für Diagnosen oder sorgfältig geprüften Integrationscode. `getClientConfig` wirft einen `TypeError`, wenn das Argument kein gültiger Client ist.

## Weiter

- [Commands](/de-DE/core/commands) erklärt die Werte, die an `execute` übergeben werden.
- [Interceptors](/de-DE/core/interceptors) beschreibt Filterung und Onion-Reihenfolge.
- [Context](/de-DE/core/context) behandelt Request-bezogene Metadaten für HTTP und SSE.

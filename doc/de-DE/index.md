---
title: Defjs
description: Typisierte HTTP-, SSE- und WebSocket-Commands mit explizitem Client und Error-first-Ergebnissen.
---

# Defjs

Definiere einen Endpoint, baue einen opaken Command und führe ihn aus. Dieselbe Form für HTTP, SSE und WebSocket.

```ts get-health.ts
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const getHealth = defineRequest({
  method: 'GET',
  path: '/health',
  output: { 200: struct.object({ ok: struct.boolean() }) },
})

const [error, result, response] = await client.execute(getHealth())
if (!error) console.log(result.ok, response.status)
```

Defjs cached keine Ergebnisse, retried nicht für dich und schließt Streams nicht, wenn du es vergisst. Cancellation und Cleanup gehören dir.

## Transport wählen

| Du brauchst                          | Starte mit                        | Erfolgreiches Ergebnis                       |
| ------------------------------------ | --------------------------------- | -------------------------------------------- |
| Request + statusspezifische Response | [HTTP](./core/http.md)            | Dekodierte Daten + `HttpResponse`            |
| Langlebiger Server-Event-Feed        | [SSE](./core/sse.md)              | Ein Stream + Startup-`open`-Snapshot         |
| Bidirektionale Session               | [WebSocket](./core/web-socket.md) | Eine Session + Startup-`connection`-Snapshot |

Neu hier? Mach [Erste Schritte](./guide/getting-started.md), dann schnapp dir ein [Rezept](./recipes/get-declared-404.md). Willst du das „Warum“? Lies [Entwurfsentscheidungen](./guide/design-decisions.md), nachdem du etwas laufen gelassen hast.

## Paket wählen

| Paket                         | Wann                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `@defjs/core`                 | `createClient` (HTTP + SSE + WebSocket)                                                    |
| `@defjs/react`                | `ClientProvider` / `useClient` — siehe [React](./plugins/react.md)                         |
| `@defjs/vue`                  | Plugin + `injectClient` — siehe [Vue](./plugins/vue.md)                                    |
| `@defjs/opentelemetry-server` | Ausgehende Spans/Metrics — siehe [OpenTelemetry Server](./plugins/opentelemetry-server.md) |

## Ergebnisformen

Alle drei Transports liefern ein Error-first-Tupel mit drei Einträgen. Positionen stimmen; Bedeutungen nicht:

- HTTP → `[error, data, response]`
- SSE → `[error, stream, open]`
- WebSocket → `[error, session, connection]`

Beim Startup-Fehler ist der zweite Eintrag `undefined`. Der dritte existiert nur, wenn dieser Transport zuerst eine Response oder ein Snapshot erzeugt hat. Siehe [Fehler](./core/errors.md).

## Ownership in einem Atemzug

Abort HTTP, wenn sie stale ist. Schließe SSE und `await stream.closed`. Schließe WebSocket und `await session.closed`. Auf einem Server erzeuge den Client innerhalb der Request-Grenze, wenn Options Cookies, Auth oder Tenant-Daten erfassen. Redact URLs, Headers und Bodies, bevor du sie loggst.

## Verwandte Rezepte

- [GET mit deklariertem 404](./recipes/get-declared-404.md)
- [POST JSON](./recipes/post-json.md)
- [HTTP-Aufruf abbrechen](./recipes/cancel-http.md)
- [SSE-Stream konsumieren](./recipes/consume-sse.md)
- [WebSocket-Session öffnen](./recipes/websocket-session.md)
- [Mit lokalem Fetch-Handle testen](./recipes/test-with-handle.md)

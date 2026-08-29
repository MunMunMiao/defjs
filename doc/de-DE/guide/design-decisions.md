---
title: Entwurfsentscheidungen
description: Warum Defjs Verträge, Commands, Transport-Ergebnisse, Decoding und Ownership explizit hält.
---

# Entwurfsentscheidungen

Defjs trifft ein paar bewusste Trade-offs. Convenience-APIs verstecken oft, wer einen Request, Stream oder eine Session besitzt. Defjs hält diese Grenze sichtbar, damit du denselben Endpoint-Vertrag wiederverwenden kannst, ohne stillschweigend Cache, Retry-Scheduler oder Resource-Manager mitzunehmen.

## Explizite Clients

Der Preis: kein process-weites Default. Dieser Preis hilft auf einem Server — erzeuge den Client innerhalb der Request-Grenze, wenn Options oder Closures Auth, Cookies, User, Tenants oder Request-Metadata erfassen. Ein expliziter Client isoliert trotzdem keinen State, den ein Interceptor erfasst. Client-Identität ist für sich keine Security-Grenze.

Ein Client dispatcht Commands. Er besitzt keine aktive Arbeit. Wer einen HTTP-Request, SSE-Stream oder eine WebSocket-Session startet, muss canceln oder schließen und auf das Terminal-Promise warten.

## Definitionen, Builder und Commands

Die Definition ist der stabile Vertrag: Method, Path, Input-Struct, Output-Mapping, Transport-Limits. Der Builder ist die aufrufbare Sicht. Der Aufruf erzeugt einen opaken Command für eine einzelne Ausführung.

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ message: struct.string() }),
  },
})

const command = getUser({ path: { id: 7 } })
```

Ein Background-Job und ein UI-Owner können dieselbe `getUser`-Form mit unterschiedlichen Cancel-/Retry-Policies ausführen. Opake Commands verhindern, dass App-Code von internen Transport-Tags oder Symbolen abhängt.

## Transport-spezifische Ergebnisse

Alle drei Transports nutzen ein Error-first-Tupel. Ein einziges generisches „Response“ würde Lifecycle-Fakten auslöschen.

- HTTP → `[error, data, response]` — dekodierter Output + `HttpResponse`
- SSE → `[error, stream, open]` — ein logischer Stream + Startup-Response-Snapshot
- WebSocket → `[error, session, connection]` — logische Session + Startup-Connection-Snapshot

Der dritte Wert ist ein Snapshot, kein Promise, dass spätere Reconnects dieselbe physische Connection behalten. Startup-Fehler kann trotzdem Response/Snapshot enthalten, wenn der Transport zuerst eines erzeugt hat. Nach dem Startup gehört Lifecycle-Kontrolle zum zurückgegebenen Handle oder zur Session.

## Runtime-Decoding

TypeScript-Inferenz beschreibt, was du erwartest; sie kann eine Server-Response zur Laufzeit nicht prüfen. Struct-Parsing ist die zweite Hälfte des Vertrags. Defjs validiert Command-Input vor dem Request-Bau, dekodiert die gewählte Representation und parst dann den passenden Struct.

Diese Reihenfolge hält Status und Body als getrennte Fakten. Exakte deklarierte Status-Auswahl passiert **vor** Body-Decode. Deklariertes Non-2xx → typisiertes `error.data`. Malformed deklarierter Body → `RESPONSE_VALIDATION_FAILED`. Undeclared Status → `UNDECLARED_STATUS` (kein untypisierter Success/Failure). Strenger als „was auch immer an JSON ankam“, aber du kannst eine sichere Entscheidung treffen.

## Die Grenzen von `build`

Automatisches `struct.request(...)`-Mapping ist Default, wenn Input schon Path/Query/Headers/Body hat. Custom `build(request, input)` ist eine eingeschränkte Projektion, wenn Caller-Shape und Wire-Shape auseinanderlaufen:

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const createBatch = defineRequest({
  method: 'POST',
  path: '/accounts/:account_id/users',
  input: struct.object({
    accountId: struct.number(),
    users: struct.array(
      struct.object({
        displayName: struct.string(),
        email: struct.string(),
      }),
    ),
  }),
  build(request, input) {
    request.setPathParams({ account_id: input.accountId })
    request.setJson({
      users: input.users.map((user) => ({
        display_name: user.displayName,
        email: user.email,
      })),
    })
  },
  output: { 202: struct.object({ accepted: struct.number() }) },
})

const command = createBatch({
  accountId: 42,
  users: [{ displayName: 'Ada', email: 'ada@example.com' }],
})
```

`input` ist eine schema-gebundene Sicht, nicht das Runtime-Objekt des Callers. Die Projektion kann deklarierte Felder wählen, Targets umbenennen und ein Source-Array-Item auf ein Output-Item mappen. Sie kann nicht auf Werte branchen, Literale injizieren oder Kardinalität ändern. Normalisiere Business-Daten und mach wertabhängige Validierung, bevor du den Command erzeugst.

## Observer und Policy-Platzierung

Interceptor sind für transportweite Policy: Auth, Tracing, Short-Circuit, reviewed Retry. Sie laufen nur für ihren Transport und komponieren in Onion-Order. Execution-Options sind für work-spezifische Lifetime: `signal`, `timeout`, WebSocket-Heartbeat, opt-in Reconnect.

Observer melden, was passiert ist, ohne zweiter Owner zu werden. SSE `onInvalidEvent`, WebSocket-State-Listener und Runtime-Error-Listener sind für begrenzte Diagnostics und Metrics. Der zurückgegebene Stream/Session besitzt weiterhin Iteration, Close, Unsubscribe und Terminal-Warten. Caching, Stale-Result-Suppression, Idempotency und Domain-Error-Mapping gehören um `client.execute(...)`, wo deine App ihre eigene Policy und ihren State sieht.

## OpenAPI, Sourcemaps und Telemetry

Defjs generiert oder sync’t keinen zweiten OpenAPI-Vertrag. Wenn OpenAPI schon autoritativ ist, behalte es und füge Runtime-Validierung an der App-Grenze hinzu. Für einen neuen Service können Endpoint-Definitionen und Structs der direkte Wire-Vertrag sein — keine zweite Source of Truth.

`withOpenTelemetryServer(...)` fügt **ausgehende** Defjs-Instrumentierung zu einem Client hinzu. Es initialisiert kein OpenTelemetry-SDK. `tracer` ist required, `meter` optional, alle drei Transports sind default enabled, und WebSocket-Query-Propagation ist default disabled. Halte Operation-Namen statisch und low-cardinality. Review Propagation, Hooks, URLs, Headers, Payloads, Causes und Retention als potenziell sensitiv.

Sourcemaps sind eine Deployment-Entscheidung, kein Defjs-Verhalten. Eine öffentliche Map mit `sourcesContent` exponiert Source; eine hidden Map enthält trotzdem Source und Paths; Maps abschalten entfernt Source-Level-Symbolication. Behandle private Maps als deploybare Debugging-Artifacts mit expliziten Access- und Retention-Regeln.

## Verwandte Rezepte

- [GET mit deklariertem 404](../recipes/get-declared-404.md)
- [Mit lokalem Fetch-Handle testen](../recipes/test-with-handle.md)

---
title: Entwurfsentscheidungen
description: Warum Defjs Verträge, Commands, Transport-Ergebnisse, Decoding und Ownership explizit hält.
---

# Entwurfsentscheidungen

Defjs trifft ein paar bewusste Trade-offs. Convenience-APIs verstecken oft, wer einen Request, Stream oder eine Session besitzt. Defjs hält diese Grenze sichtbar, damit du denselben Endpoint-Vertrag wiederverwenden kannst, ohne stillschweigend Cache, Retry-Scheduler oder Resource-Manager mitzunehmen.

## Deklaration ist eine Zusicherung

Diese sechs Regeln entscheiden jede Frage danach, wie eine Response gelesen wird. Sie sind numeriert, damit eine spätere Diskussion eine davon zitieren kann, statt sie neu herzuleiten.

### 1. Was du deklarierst, sicherst du zu

`output` heißt: "wenn `ok` true ist, **ist** der Body diese Form". `error` heißt: "wenn `ok` false ist, **ist** der Body diese Form". Eine Deklaration ist kein Hinweis und keine Best-Effort-Hoffnung, sondern eine Behauptung darüber, was ankommen wird.

### 2. `ok` ist die einzige Verzweigung, und es dekodiert immer nur eine Seite

Eine 2xx-Response wird mit `output` gelesen. Alles andere mit `error`. Nie beides, nie das andere als Fallback.

### 3. Realität, die von der Zusicherung abweicht, ist ein Failure — und wird laut gemeldet

Kein Raten von Formaten, kein Abstieg auf etwas Schwächeres, kein Schweigen. Ob sich das Backend geändert hat, ein Gateway eingegriffen hat oder jemand die Response manipuliert hat, **ändert die Schlussfolgerung nicht** — die Library kann das nicht unterscheiden und sollte nicht so tun.

Das ist die Regel, die man am häufigsten aufgeweicht haben will, deshalb sei der Fall klar benannt. Angenommen, ein Angreifer kann eine `200` umschreiben, die deine Seite gerade mit `output` lesen wollte, und du bekommst stattdessen eine `3xx`, `4xx` oder `5xx`. Zu scheitern ist keine Unannehmlichkeit, sondern das einzige sichere Ergebnis. Dir den rohen Body "für alle Fälle" zu geben, würde jedem, der eine Response injizieren kann, einen Weg um genau die Validierung geben, die du angefordert hast.

### 4. Ein fehlgeschlagenes Dekodieren hat keinen Body

Ein Body **ist** ein dekodierter Wert. Wenn das Dekodieren fehlschlug, gibt es keinen Wert — es gibt keinen halb dekodierten Body zum Inspizieren. Das auslösende Detail liegt auf `cause`; die Response behält ihre Metadaten und nichts weiter.

Diese Regel erzwingt das Typsystem, nicht die Konvention: Das `response` eines Decode-Faults ist `HttpMeta` und hat überhaupt kein `body`-Feld — der Griff danach ist ein Compile-Error.

### 5. Wenn du die Zusicherung nicht willst, deklariere nicht

`output` auszulassen heißt "der 2xx-Body interessiert mich nicht" — er wird nie gelesen. `error` auszulassen sagt dasselbe für alles andere. Das ist ein explizites Opt-out, kein Versehen, und es gilt vollständig: ein unlesbarer Body auf der Seite, die du abgewählt hast, ist nicht deine Sache — nicht einmal die Tatsache, dass er nicht lesbar war.

### 6. 3xx ist kein Error-Code-Bereich

Wenn du weißt, dass ein Endpoint mit einem Redirect-Status antwortet, gib `output` kein Schema dafür, oder deklariere eines, das einen leeren Wert akzeptiert. Andernfalls ist ein gemeldeter Failure das erwartete Ergebnis und keine Lücke.

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
  output: struct.object({ id: struct.number(), name: struct.string() }),
  error: struct.object({ message: struct.string() }),
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

Dekodiert wird **einmal, nach der Interceptor-Chain**. Eine Response, die ein Interceptor mit `makeResponse(...)` gebaut hat, wird genau wie eine von der Leitung interpretiert: woher eine Response kam, ändert nicht, wie sie gelesen wird — es gibt also keinen "dem Interceptor vertrauen"-Pfad, über den man nachdenken müsste.

Die Reihenfolge ist: Media-Type, dann Representation, dann Struct.

| Was nicht gehalten hat                                                   | Fault                                                                |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Der Media-Type ist nicht der, den die deklarierte Representation braucht | `RES_MEDIA_TYPE_INVALID` — gemeldet, **bevor** der Body gelesen wird |
| Die Bytes sind nicht diese Representation                                | `RES_DECODE_FAILED`                                                  |
| Der Wert ist nicht dieser Struct                                         | `RES_STRUCT_MISMATCH`                                                |
| Non-2xx, und `error` hat dekodiert                                       | `HTTP_STATUS` mit typisiertem `data`                                 |
| Non-2xx, und `error` war nicht deklariert                                | `HTTP_STATUS` mit `data: undefined`                                  |

Den Media-Type zuerst zu prüfen macht aus "ich wollte JSON und bekam HTML" einen präzisen Fault statt eines Parser-Errors — und es überspringt Lesen, Parsen und Struct komplett.

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
  output: struct.object({ accepted: struct.number() }),
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

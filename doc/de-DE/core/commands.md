---
title: Commands
description: Definiere Endpunkte, erzeuge Command-Builder und Commands, bilde Struct-Eingaben auf den Wire ab und leite HTTP-Output-Typen ab.
---

# Commands

Defjs unterscheidet drei zusammengehörige Stufen:

1. Eine **Endpunktdefinition** beschreibt einen stabilen HTTP-, SSE- oder WebSocket-Vertrag.
2. Ein **Command-Builder** ist die Funktion, die `defineRequest`, `defineEventStream` oder `defineWebSocket` zurückgibt.
3. Ein **Command** ist der Wert, den ein Aufruf dieses Builders mit einer Eingabe erzeugt. Übergib ihn an `client.execute(...)`.

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
})

const command = getUser({ path: { id: 42 } })
const result = await client.execute(command)
```

Das Objekt für `defineRequest` ist die Endpunktdefinition, `getUser` der Command-Builder und `command` der Command.

## HTTP-Endpunktdefinitionen

`defineRequest(...)` akzeptiert diese Felder:

| Feld           | Bedeutung                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| `method`       | String mit der HTTP-Methode.                                                                                          |
| `path`         | Relativer Endpunktpfad mit optionalen Platzhaltern der Form `:name`.                                                  |
| `input`        | Struct zur strukturellen Dekodierung der Command-Eingabe.                                                             |
| `build`        | Schemagebundene Projektion von Eingabefeldern auf Request-Bestandteile. Benötigt `input`.                             |
| `output`       | Zuordnung von Status zu Struct für Response-Dekodierung und Ergebnisableitung.                                        |
| `responseType` | Optionaler Modus `json`, `text`, `blob` oder `arraybuffer`, nur mit deklariertem `output`; andernfalls nicht erlaubt. |

Verwende `struct.request(...)`, wenn sich Command-Felder direkt auf Wire-Abschnitte abbilden lassen:

```typescript
import { defineRequest, struct } from '@defjs/core'

const createUser = defineRequest({
  method: 'POST',
  path: '/organizations/:organizationId/users',
  input: struct.request({
    path: struct.object({
      organizationId: struct.string().alias('organization_id'),
    }),
    query: struct.object({
      notify: struct.boolean().optional(),
    }),
    headers: struct.object({
      requestId: struct.string().alias('x-request-id'),
    }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
  output: [
    { status: 201, body: struct.object({ id: struct.number() }) },
    { status: 409, body: struct.object({ message: struct.string() }) },
  ] as const,
})

const command = createUser({
  path: { organizationId: 'acme' },
  query: { notify: true },
  headers: { requestId: 'request-42' },
  body: { displayName: 'Ada' },
})
```

Aufrufer verwenden die logischen Feldnamen. Aliasse bestimmen die Wire-Schlüssel.

## Optionalität des Command-Builders

Ein Builder ohne `input` akzeptiert kein Argument:

```typescript
const health = defineRequest({ method: 'GET', path: '/health' })
health()
```

Wenn `input` deklariert ist, müssen Pflichtfelder des Objekts und jeder deklarierte Request-Abschnitt angegeben werden. Nur optional oder nullish markierte Felder dürfen fehlen. Abschnitte, die der Endpoint nicht verwendet, sollten nicht deklariert werden.

```typescript
const search = defineRequest({
  method: 'GET',
  path: '/search',
  input: struct.request({
    query: struct.object({ q: struct.string() }),
  }),
})

search({ query: { q: 'docs' } })
// search() // TypeScript error: an argument is required.
// search({ query: {} }) // TypeScript and runtime error: q is required.
```

Dies prüft strukturelle Anwesenheit und Typen, nicht fachliche Autorisierung, Wertebereiche, Beträge, Formate oder Zustandsübergänge.

## Automatischer Request-Aufbau

Wenn `input` ein `struct.request(...)` ist und `build` fehlt, ordnet Defjs die deklarierten Abschnitte automatisch zu:

- `path` ersetzt Pfadplatzhalter.
- `query` wird zu Query-Parametern.
- `headers` wird zu Request-Headern.
- `body` verwendet seinen Body-Wrapper.

Request-Bodies müssen eine unterstützte Grenze deklarieren:

```typescript
struct.json(struct.object({ name: struct.string() }))
struct.text()
struct.urlencoded({ name: struct.string() })
struct.formData({ file: struct.file() })
struct.blob()
struct.arrayBuffer()
```

Lege kein bloßes `struct.object(...)` in `request.body` ab; `struct.request(...)` weist es zurück. HTTP unterstützt alle Body-Formen. SSE weist einen Body-Abschnitt zurück, WebSocket sowohl Header- als auch Body-Abschnitte.

## Eigenes `build`

Verwende `build(request, input)`, wenn logische Felder an andere Wire-Positionen oder unter andere Schlüssel gehören. Der Parameter `input` ist eine **schemagebundene Projektion**, nicht der geparste Wert des Aufrufers.

```typescript
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
  output: [{ status: 202, body: struct.object({ accepted: struct.number() }) }] as const,
})
```

Eine Projektion kann:

- deklarierte Felder auswählen;
- Zielschlüssel für den Wire bestimmen;
- ein Array Element für Element mit `.map(...)` projizieren;
- ein ausgewähltes Objekt mit seinen Feldaliasen kodieren, wenn es an JSON gebunden wird.

Eine Projektion kann keine Aufruferwerte untersuchen, abhängig von ihnen verzweigen, beliebige Transformationen berechnen, die Anzahl der Arrayelemente ändern oder Literalwerte einschleusen. `request.setJson({ version: 'v1' })` ist beispielsweise keine gültige Projektion, weil `'v1'` nicht aus der Bindungsansicht der Eingabe stammt.

Normalisiere und validiere Anwendungsdaten, bevor du den Command erzeugst. `build` ist für deklaratives Wire-Mapping gedacht.

### Fähigkeiten von `build`

| Ziel                                                                | HTTP | SSE  | WebSocket |
| ------------------------------------------------------------------- | ---- | ---- | --------- |
| `setPathParams`, `setQueryParams`                                   | Ja   | Ja   | Ja        |
| `setHeaders`, `addHeaders`                                          | Ja   | Ja   | Nein      |
| JSON-, Text-, HTML-, Formular-, Blob- und ArrayBuffer-Body-Methoden | Ja   | Nein | Nein      |

Der TypeScript-Build-Context ist transportspezifisch. Laufzeitprüfungen weisen nicht unterstützte Ausgaben ebenfalls zurück, falls die Typprüfung umgangen wurde.

## Ableitung des HTTP-Outputs

`output` unterstützt eine Objektzuordnung oder ein Array aus Status-Body-Paaren:

```typescript
const User = struct.object({ id: struct.number() })
const NotFound = struct.object({ message: struct.string() })
const Unauthorized = struct.object({ message: struct.string() })

const objectOutput = {
  '200': User,
  '404': NotFound,
}

const arrayOutput = [
  { status: 200, body: User },
  { status: [401, 403], body: Unauthorized },
] as const
```

Der HTTP-Erfolgstyp ist die Union der deklarierten 2xx-Bodies. `error.data` ist die Union der deklarierten Nicht-2xx-Bodies. Die Array-Form benötigt `as const`, damit Statusliterale und gruppierte readonly Arrays erhalten bleiben.

Sobald `output` deklariert ist, braucht jeder zurückgegebene Status ein passendes Struct. Ein nicht zugeordneter 2xx- oder Nicht-2xx-Status erzeugt `UNDECLARED_STATUS`. Ohne `output` wird der Response-Body nicht gelesen oder dekodiert und nach bestem Bemühen abgebrochen; das Ergebnis ist `undefined`.

## SSE- und WebSocket-Definitionen

`defineEventStream(...)` verwendet statt des HTTP-`output` eine `events`-Zuordnung. Eventnamen wählen Structs aus; ein optionaler Eintrag `default` verarbeitet zur Laufzeit nicht deklarierte Namen.

```typescript
const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: {
    message: struct.json(struct.object({ text: struct.string() })),
    default: struct.string(),
  },
})
```

`defineWebSocket(...)` deklariert Zuordnungen für eingehende und optional ausgehende Nachrichten. Nachrichtenumschläge verwenden `type` als Diskriminator.

```typescript
const chat = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: {
    message: struct.object({ text: struct.string() }),
  },
  outgoing: {
    send: struct.object({ text: struct.string() }),
  },
})
```

[SSE](/de-DE/core/sse) und [WebSocket](/de-DE/core/web-socket) erklären Dekodierung, Warteschlangen, Reconnect und die Verantwortung für das Schließen.

## Commands als opake Werte behandeln

Anwendungscode sollte Commands erzeugen und an `Client.execute(...)` übergeben. Verlasse dich nicht auf Transport-Tags oder strukturelle Reflexion.

Der zentrale Paketeinstieg exportiert derzeit Transport-Command-Interfaces und Low-Level-Executor-Funktionen. Für den empfohlenen Ablauf werden diese Exporte nicht benötigt; eine langfristige Stabilitätszusage ist in dieser Dokumentation nicht festgelegt. Die von der Laufzeitverteilung verwendeten Command-Tag-Symbole und Guard-Funktionen werden dort nicht exportiert.

## Weiter

- [Client](/de-DE/core/client) behandelt Ausführungs-Overloads und Optionskomposition.
- [HTTP](/de-DE/core/http) ist die Referenz für URLs, Kodierung, Responses und Abbruch.
- [Struct](/de-DE/core/struct) erklärt strikte strukturelle Dekodierung.

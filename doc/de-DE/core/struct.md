---
title: Struct
description: Beschreibe strikte strukturelle Dekodierung, erforderliche und optionale Eingaben, Aliasse und die Behandlung von StructError.
---

# Struct

Structs beschreiben strikte strukturelle Dekodierung und Wire-Kodierung. Fehlende Pflichtwerte und ungültige Werte schlagen fehl, statt Standardwerte zu erzeugen.

Verwende die `struct`-Fassade und `Infer<T>` aus dem zentralen Paketeinstieg:

```typescript
import { struct, type Infer, type StructInput } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  active: struct.boolean(),
})

type User = Infer<typeof User>
// { id: number; name: string; active: boolean }
```

## Konstruktoren

Zu den gebräuchlichen Konstruktoren gehören:

```typescript
struct.string()
struct.number()
struct.boolean()
struct.bigint()
struct.date()
struct.null()
struct.literal('ready')
struct.enum(['pending', 'done'])
struct.array(struct.string())
struct.tuple([struct.string(), struct.number()])
struct.object({ id: struct.number() })
struct.record(struct.number())
struct.or(struct.string(), struct.number())
struct.intersection(struct.object({ id: struct.number() }), struct.object({ name: struct.string() }))
struct.discriminatedUnion('kind', [
  struct.object({ kind: struct.literal('click'), x: struct.number() }),
  struct.object({ kind: struct.literal('key'), key: struct.string() }),
])
```

`struct.any()` und `struct.unknown()` akzeptieren jeden Wert außer `null` und `undefined`; dieselben Modifikatoren erlauben diese Werte ausdrücklich. Binäre Konstruktoren sind `struct.blob()`, `struct.file()` und `struct.arrayBuffer()`.

Jedes Struct unterstützt diese Modifikatoren:

```typescript
struct.string().optional()
struct.string().null()
struct.string().nullish()
struct.string().alias('wire_name')
```

## Striktes Parsen

Mit `struct.parse(schema, input)` wird ein Wert außerhalb eines Commands dekodiert. Das Ergebnis ist ein festes error-first Tupel:

```typescript
const Profile = struct.object({
  name: struct.string(),
  nickname: struct.string().optional(),
  biography: struct.string().null(),
  note: struct.string().nullish(),
})

const [error, profile] = struct.parse(Profile, input)

if (error) {
  // profile is undefined
  return
}
```

```typescript
type ParseResult<T> = [error: null, value: T] | [error: StructError, value: undefined]
```

Ein einheitlicher Modifier-Vertrag gilt: Fehlende Werte und `undefined` sind nur mit `.optional()` oder `.nullish()` erlaubt; explizites `null` nur mit `.null()` oder `.nullish()`. `.null()` macht einen Wert nicht optional.

Fehlende optionale und nullish Objektfelder werden aus der Ausgabe weggelassen; auf oberster Ebene ergeben sie `undefined`. Unbekannte Objektschlüssel werden verworfen. Dekodierte Objekt- und Record-Ausgaben haben einen Null-Prototyp.

Nodes strikter tiefer Gleichheitsvergleich berücksichtigt Prototypen. Ein geparstes Struct-Objekt ist deshalb nicht tiefengleich mit einem Objektliteral mit denselben Feldern. Prüfe diese Grenze ausdrücklich oder erstelle nur für die Assertion eine flache Kopie:

```typescript
import assert from 'node:assert/strict'

const [error, profile] = struct.parse(struct.object({ name: struct.string() }), { name: 'Ada' })
assert.equal(error, null)
assert.equal(Object.getPrototypeOf(profile), null)
assert.deepEqual({ ...profile }, { name: 'Ada' })
```

Der Spread ist nur eine flache Kopie für diese Assertion. Verschachtelte Struct-Objekte haben weiterhin einen Null-Prototyp. Füge nicht allein für einen Test-Matcher eine globale Normalisierung oder Clone-Schicht in den Produktionspfad ein.

Mit `exactOptionalPropertyTypes` verwenden abgeleitete Objekteingaben exakte optionale Eigenschaften. Lasse einen optionalen oder nullish Schlüssel weg, statt ihm `undefined` zuzuweisen:

```typescript
const OptionalProfile = struct.object({
  nickname: struct.string().optional(),
})

type OptionalProfileInput = StructInput<typeof OptionalProfile>

const omitted: OptionalProfileInput = {}
// @ts-expect-error With exactOptionalPropertyTypes, omit optional keys instead.
const explicitUndefined: OptionalProfileInput = { nickname: undefined }
```

Zur Laufzeit akzeptiert `struct.parse` ein explizites `undefined` aus unbekannten Eingaben defensiv und lässt den Schlüssel weg. Diese Normalisierung erweitert den statisch abgeleiteten Eingabetyp für Aufrufer nicht.

## Erforderliche Objekt- und Request-Eingaben

Objekteigenschaften sind in TypeScript und zur Laufzeit erforderlich, sofern ihr Struct nicht optional oder nullish ist. Auch jeder in `struct.request(...)` deklarierte Abschnitt ist erforderlich; nicht deklarierte Abschnitte gehören nicht zum Eingabetyp.

```typescript
const Input = struct.request({
  path: struct.object({ id: struct.string() }),
  query: struct.object({ page: struct.number().optional() }),
})

// { path: { id: string }; query: { page?: number } }
```

Fehlt `query`, ist das ein Fehler; `query: {}` ist gültig. Ein fehlendes Pflichtfeld, explizites `undefined`, verbotenes `null` oder ein falscher Laufzeittyp lässt den gesamten Parse-Vorgang ohne Teilwert fehlschlagen.

Zusammengesetzte Structs stoppen beim ersten bestimmten Issue. Die Länge einer Tupel-Eingabe muss exakt der Deklaration entsprechen. `struct.or(...)` probiert Alternativen weiterhin der Reihe nach, und `struct.discriminatedUnion(...)` wählt weiterhin einen deklarierten Zweig.

Wenn Discriminator-Felder Aliase verwenden, liest `struct.discriminatedUnion(...)` in der Deklarationsreihenfolge der Optionen den ersten tatsächlich vorhandenen Wire-Discriminator. Nach der Zweigauswahl liest es keinen Alias einer späteren Option mehr.

Structs erzwingen die deklarierte Struktur, nicht fachliche Autorisierungs-, Wertebereichs-, Betrags-, Format- oder Zustandsregeln. Es gibt keine öffentliche DSL für Refine-, Range- oder Formatregeln.

`struct.number()` akzeptiert positives und negatives `Infinity`; von den JavaScript-Zahlen schließt es nur `NaN` aus. Prüfe Endlichkeit, Wertebereiche und Domänenregeln im Anwendungscode, bevor du einen Command erzeugst. Diese Prüfungen gehören nicht in `build`, denn `build` erhält eine schemagebundene Projektion und keine Laufzeitwerte des Aufrufers.

## Request-Bodies

`struct.request(...)` gruppiert Abschnitte für direkte Wire-Zuordnung:

```typescript
const input = struct.request({
  path: struct.object({ organizationId: struct.string() }),
  query: struct.object({ includeDisabled: struct.boolean().optional() }),
  headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
  body: struct.json(
    struct.object({
      displayName: struct.string().alias('display_name'),
    }),
  ),
})
```

Folgende Body-Grenzen stehen zur Verfügung:

| Struct                     | Kodierung         |
| -------------------------- | ----------------- |
| `struct.json(inner)`       | JSON              |
| `struct.text()`            | Plain Text        |
| `struct.urlencoded(shape)` | `URLSearchParams` |
| `struct.formData(shape)`   | `FormData`        |
| `struct.blob()`            | `Blob`            |
| `struct.arrayBuffer()`     | `ArrayBuffer`     |

[Commands](/de-DE/core/commands) erklärt das automatische Request-Mapping und transportspezifische Einschränkungen.

## Aliasse

`.alias(name)` ändert den Wire-Schlüssel, nicht den logischen TypeScript-Schlüssel.

```typescript
const UserBody = struct.object({
  id: struct.number().alias('user_id'),
  displayName: struct.string().alias('display_name'),
})

const [logicalError, logicalUser] = struct.parse(UserBody, { id: 1, displayName: 'Ada' })
if (logicalError) throw logicalError

const [wireKeyError] = struct.parse(UserBody, { user_id: 1, display_name: 'Ada' })
if (!wireKeyError) throw new Error('struct.parse must read logical keys')
```

`logicalUser` verwendet `{ id, displayName }`; `wireKeyError` zeigt auf die fehlende logische `id`-Eigenschaft. Das öffentliche `struct.parse` liest nur logische Werte und behandelt Wire-Schlüssel nicht als Standalone-Parse-Eingabe.

Erst die JSON-Kodierung und -Dekodierung des Transports wendet Wire-Aliasse an:

```typescript
import { createClient, defineRequest, withEndpoint, withHTTPHandle } from '@defjs/core'

let requestWireBody: unknown
const echoUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.request({ body: struct.json(UserBody) }),
  output: { 200: UserBody },
})
const client = createClient(
  withEndpoint('https://example.test'),
  withHTTPHandle(async (input, init) => {
    requestWireBody = await new Request(input, init).json()
    return Response.json({ user_id: 1, display_name: 'Ada' })
  }),
)

const [requestError, responseUser] = await client.execute(echoUser({ body: { id: 1, displayName: 'Ada' } }))
if (requestError) throw requestError
```

`requestWireBody` ist `{ user_id, display_name }`, `responseUser` wieder `{ id, displayName }`. Der automatische Request-Aufbau verwendet Aliasse außerdem für ausgehende Pfad-, Query-, Header-, URL-encoded- und Multipart-Schlüssel; explizite Zielschlüssel in einer eigenen `build`-Projektion bleiben unverändert.

## `StructError`

Eine fehlgeschlagene strukturelle Dekodierung erzeugt einen `StructError`, häufig als `RequestError.cause`.

```typescript
import { StructError, type RequestError, type StructIssue } from '@defjs/core'

export function structIssues(error: RequestError): readonly StructIssue[] {
  if (error.kind === 'definition' && error.cause instanceof StructError) {
    return error.cause.issues
  }
  return []
}
```

Ein `StructError` stellt bereit:

- `issues`, das ursprüngliche `StructIssue[]`;
- `format()`, einen verschachtelten Baum aus Meldungen;
- `flatten()`, Meldungen auf oberster Formular- und Feldebene;
- `prettify()`, einen lesbaren mehrzeiligen String.

`StructIssue.received` kann Eingabe- oder Responsedaten enthalten. Standardmeldungen können eine Darstellung dieses Werts enthalten. Auch Pfade und formatierte Schlüssel können aus nicht vertrauenswürdigen Daten stammen, insbesondere bei Records. Redigiere oder prüfe `issues`, Meldungen, `format()`, `flatten()` und `prettify()`, bevor du sie loggst oder zurückgibst.

## Globale Fehlermeldungen

`setErrorMap(...)` ersetzt die Meldungserzeugung prozessweit:

```typescript
import { setErrorMap } from '@defjs/core'

setErrorMap((issue) => {
  if (issue.code === 'invalid_type') {
    return `Invalid value at ${issue.path.join('.')}`
  }
  return undefined
})
```

Die Map ist global und nicht an einen Client gebunden. Eine Änderung wirkt sich auf spätere Struct-Issues aller Clients im selben JavaScript-Realm aus. Verwende keinen Request-bezogenen Zustand im Callback und koordiniere die Installation in Anwendungen, die einen Prozess teilen.

## Weiter

- [Commands](/de-DE/core/commands) bildet Struct-Felder auf Requests und Nachrichten ab.
- [Fehler](/de-DE/core/errors) erklärt, wie Struct-Fehler in Ausführungstupeln erscheinen.
- [HTTP](/de-DE/core/http) behandelt Response-Dekodierung und Repräsentationsfehler.

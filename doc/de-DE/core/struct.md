---
title: Struct
description: Beschreibe strikte strukturelle Dekodierung, erforderliche und optionale Eingaben, Aliasse und die Behandlung von StructError.
---

# Struct

Structs beschreiben strikte strukturelle Dekodierung und Wire-Kodierung. Fehlende Pflichtwerte und ungültige Werte schlagen fehl, statt Standardwerte zu erzeugen.

Verwende die `struct`-Fassade und `Infer<T>` aus dem zentralen Paketeinstieg:

```typescript
import { struct, type Infer } from '@defjs/core'

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

// Caller input uses { id, displayName }.
// JSON wire data uses { user_id, display_name }.
```

Aliasse werden beim Dekodieren und Kodieren von JSON-Schlüsseln verwendet. Der automatische Request-Aufbau nutzt sie außerdem für ausgehende Pfad-, Query-, Header-, URL-encoded- und Multipart-Schlüssel. Aufrufer verwenden weiterhin logische Schlüssel. Explizite Zielschlüssel in einer eigenen `build`-Projektion bleiben explizit.

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

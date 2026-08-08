---
title: Struct
description: Beschreibe strukturelle Dekodierung, Zero Values, partielle Objekteingaben, Aliasse und die Behandlung von StructError.
---

# Struct

Structs beschreiben strukturelle Dekodierung und Wire-Kodierung. Ihr ausgewähltes Zero-Value-Verhalten ist von Go inspiriert, bildet die Semantik von Gos `encoding/json` aber nicht vollständig nach.

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

`struct.any()` und `struct.unknown()` akzeptieren unbeschränkte Werte. Binäre Konstruktoren sind `struct.blob()`, `struct.file()` und `struct.arrayBuffer()`.

Jedes Struct unterstützt diese Modifikatoren:

```typescript
struct.string().optional()
struct.string().null()
struct.string().nullish()
struct.string().alias('wire_name')
```

## Zero Values

Fehlende Werte und `undefined` werden zu einem Zero Value dekodiert, sofern das Struct nicht optional ist. Ein `null` bei einem nicht-nullable Struct folgt demselben Zero-Value-Pfad. Ein nullable Struct dekodiert fehlende Werte, `undefined` und `null` zu `null`.

Ausgewählte Zero Values sind:

| Struct                        | Zero Value                                            |
| ----------------------------- | ----------------------------------------------------- |
| `string`                      | `''`                                                  |
| `number`                      | `0`                                                   |
| `boolean`                     | `false`                                               |
| `bigint`                      | `0n`                                                  |
| `date`                        | `new Date(0)`                                         |
| Array                         | `[]`                                                  |
| Objekt                        | Ein Objekt, dessen Felder ihre Zero Values enthalten  |
| Tupel                         | Ein Tupel, dessen Elemente ihre Zero Values enthalten |
| Enum                          | Der erste deklarierte Wert                            |
| Literal                       | Das deklarierte Literal                               |
| `blob`, `file`, `arrayBuffer` | Ein leerer Wert des jeweiligen Typs                   |
| `any`, `unknown`              | `undefined`                                           |

In einem Objekt wird ein fehlendes Feld, das nur mit `.optional()` markiert ist, aus der dekodierten Ausgabe weggelassen. `.nullish()` ist zugleich optional und nullable. Bei einem fehlenden Wert hat die nullable Behandlung Vorrang, sodass derzeit `null` entsteht.

```typescript
const Profile = struct.object({
  name: struct.string(),
  nickname: struct.string().optional(),
  biography: struct.string().null(),
})

// Decoding {} produces an object equivalent to:
// { name: '', biography: null }
```

Unbekannte Objektschlüssel werden verworfen. Dekodierte Objekt- und Record-Ausgaben haben einen Null-Prototyp. Code, der Methoden von `Object.prototype` benötigt, sollte `Object.keys`, `Object.entries` oder eine bewusste Kopie in ein normales Objekt verwenden.

## Partielle Eingaben sind beabsichtigt

Eigenschaften einer Objekteingabe sind an der TypeScript-Grenze optional, selbst wenn die dekodierte Ausgabeeigenschaft vorhanden ist. Das gilt auch für Request-Abschnitte in `struct.request(...)`.

```typescript
const Point = struct.object({
  x: struct.number(),
  y: struct.number(),
})

// A command using Point as input accepts {}.
// Structural decoding produces { x: 0, y: 0 }.
```

Bezeichne diese Felder nicht als Pflichtfelder. Structs bieten keine fachliche Prüfung auf vorhandene Felder, Autorisierung, Wertebereiche, Beträge, Formate oder Zustandsübergänge. Es gibt keine öffentliche DSL für Refine-, Range- oder Formatregeln.

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
- [HTTP](/de-DE/core/http) behandelt Response-Dekodierung und die aktuelle Einschränkung bei ungültigem JSON.

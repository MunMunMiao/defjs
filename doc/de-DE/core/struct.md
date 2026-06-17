---
title: Struct
description: Declarative schema definition, type inference, error mapping, and the field tag system.
---

# Struct

`@defjs/core` bietet eine leichtgewichtige Struct-Fassade zum Deklarieren von Schemata, Validieren von Inputs und Inferieren von Typen. Das Design-Intent ist modelliert nach Gos `encoding/json`: Zero-Value-Fallback, Akzeptieren partieller Input und stabiles, vorhersagbares Laufzeitverhalten.

## Primitive Typen

Alle Schemata werden über den `struct`-Namespace erstellt, unterstützt Chain-Calls `.optional()`, `.null()`, `.nullish()` und `.tag(...)`.

### Skalare

```typescript
import { struct } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  active: struct.boolean(),
  role: struct.literal('admin'),
})

type User = struct.Infer<typeof User>
// { id: number; name: string; active: boolean; role: 'admin' }
```

Verfügbare Skalare:

| Konstruktor            | Input-Typ                               | Output-Typ    | Zero-Value           |
| ---------------------- | --------------------------------------- | ------------- | -------------------- |
| `struct.string()`      | `string \| undefined`                   | `string`      | `''`                 |
| `struct.number()`      | `number \| undefined`                   | `number`      | `0`                  |
| `struct.boolean()`     | `boolean \| undefined`                  | `boolean`     | `false`              |
| `struct.bigint()`      | `bigint \| string \| undefined`         | `bigint`      | `0n`                 |
| `struct.date()`        | `Date \| number \| string \| undefined` | `Date`        | `new Date(0)`        |
| `struct.null()`        | `null`                                  | `null`        | `null`               |
| `struct.any()`         | `unknown`                               | `any`         | `undefined`          |
| `struct.unknown()`     | `unknown`                               | `unknown`     | `undefined`          |
| `struct.blob()`        | `Blob \| undefined`                     | `Blob`        | `new Blob()`         |
| `struct.file()`        | `File \| undefined`                     | `File`        | `new File([], '')`   |
| `struct.arrayBuffer()` | `ArrayBuffer \| undefined`              | `ArrayBuffer` | `new ArrayBuffer(0)` |

### Optional und Nullable

```typescript
const Profile = struct.object({
  bio: struct.string().optional(), // Output-Typ: string | undefined
  age: struct.number().null(), // Output-Typ: number | null
  nick: struct.string().nullish(), // Output-Typ: string | null | undefined
})
```

### Enums und Literals

```typescript
const Status = struct.enum(['pending', 'done', 'cancelled'])
const Priority = struct.objectEnum({ Low: 1, Medium: 2, High: 3 })

const Flag = struct.literal(true)
```

### Arrays, Tuples, Records

```typescript
const Tags = struct.array(struct.string())
const Pair = struct.tuple([struct.string(), struct.number()])
const Dict = struct.record(struct.number())
```

### Unions und Intersections

```typescript
const Id = struct.union([struct.string(), struct.number()])
const Named = struct.intersection(struct.object({ id: struct.number() }), struct.object({ name: struct.string() }))
```

### Discriminated Unions

```typescript
const Event = struct.discriminatedUnion('kind', [
  struct.object({ kind: struct.literal('click'), x: struct.number(), y: struct.number() }),
  struct.object({ kind: struct.literal('key'), key: struct.string() }),
])
```

## Request-Schemata

`struct.request(...)` organisiert `path`, `query`, `headers` und `body` in eine einzelne Input-Struktur für automatischen HTTP-Request-Build durch den Endpoint.

```typescript
const CreateUser = struct.request({
  path: struct.object({ orgId: struct.number() }),
  query: struct.object({ dryRun: struct.boolean().optional() }),
  headers: struct.object({
    'X-Api-Key': struct.string().tag(tag.header('X-Api-Key')),
  }),
  body: struct.json(
    struct.object({
      name: struct.string().tag(tag.json('user_name')),
    }),
  ),
})
```

Body-Wrapper bestimmen Transport-Encoding:

| Wrapper                    | Encoding           |
| -------------------------- | ------------------ |
| `struct.json(schema)`      | `JSON.stringify`   |
| `struct.urlencoded(shape)` | `URLSearchParams`  |
| `struct.formData(shape)`   | `FormData`         |
| `struct.text()`            | Plain text         |
| `struct.blob()`            | Binary Blob        |
| `struct.arrayBuffer()`     | Binary ArrayBuffer |

## `Infer<T>` Typ-Inferenz

`struct.Infer<T>` extrahiert den Output-Typ eines Schemas. Es ist der einzige Typ-Level-Helper, den du beherrschen musst.

```typescript
const Person = struct.object({
  name: struct.string(),
  age: struct.number().optional(),
})

type Person = struct.Infer<typeof Person>
// { name: string; age?: number }
```

`Infer` funktioniert auch für `struct.array(...)`, `struct.union(...)`, `struct.request(...)`:

```typescript
type Tags = struct.Infer<typeof Tags> // string[]
type Id = struct.Infer<typeof Id> // string | number
type Req = struct.Infer<typeof CreateUser> // { path: { orgId: number }; query?: { dryRun?: boolean }; ... }
```

## StructError und Error-Mapping

Falls Validierung fehlschlägt, gibt die Laufzeit `StructError` zurück, enthaltend ein komplettes `SchemaIssue[]`.

```typescript
import { struct, StructError } from '@defjs/core'

const [error, value] = struct.parseTuple(User, { id: 42 })
if (error) {
  console.log(error.issues)
  // [{ code: 'missing_key', path: ['name'], expected: 'string', received: undefined, message: '...' }]
}
```

### Error-Formatierung

```typescript
error.format() // Tree-Objekt { _errors: [], name: { _errors: ['...'] } }
error.flatten() // Flat-Objekt { formErrors: [], fieldErrors: { name: ['...'] } }
error.prettify() // String: "× name: Expected string, received undefined"
```

### Globales Error-Mapping

Default-Nachrichten ersetzen via `setErrorMap`:

```typescript
import { setErrorMap } from '@defjs/core'

setErrorMap((issue) => {
  if (issue.code === 'missing_key') {
    return `Field ${issue.path.join('.')} is required`
  }
  return undefined // Unabgedeckte Issues verwenden Default-Nachrichten
})
```

## Tag-System

Tags sind Metadaten, die an Felder angehängt werden, von Codecs, Request-Buildern oder externen Adaptern gelesen. Das Core bietet 6 eingebaute Namespaces:

| Namespace               | Zweck                       | No-Arg-Verhalten                |
| ----------------------- | --------------------------- | ------------------------------- |
| `tag.json()`            | JSON-Feld-Wire-Key          | Fällt auf Feldnamen zurück      |
| `tag.urlencoded()`      | URL-encoded-Feld-Wire-Key   | Fällt auf Feldnamen zurück      |
| `tag.multipart()`       | Multipart-Feld-Wire-Key     | Fällt auf Feldnamen zurück      |
| `tag.query(fieldName)`  | Query-Parameter-Wire-Key    | **Muss explizit Namen angeben** |
| `tag.uri(fieldName)`    | URI-Path-Parameter-Wire-Key | **Muss explizit Namen angeben** |
| `tag.header(fieldName)` | HTTP-Header-Wire-Key        | **Muss explizit Namen angeben** |

### Nutzungsbeispiel

```typescript
import { struct, tag } from '@defjs/core'

const UserBody = struct.object({
  id: struct.number().tag(tag.json('user_id')),
  name: struct.string().tag(tag.json('user_name')),
  email: struct.string().tag(tag.header('X-User-Email')),
})
```

### Custom-Config-Tag

`tag.defineConfig` erlaubt Drittbibliotheken, ihren eigenen Namespace und Config-Key zu definieren:

```typescript
import { tag } from '@defjs/core'

const GormTag = tag.createTagNamespace('gorm')
const gorm = tag.defineConfig(GormTag)

const Model = struct.object({
  id: struct.number().tag(gorm('column', 'id'), gorm('primaryKey')),
})
```

Regeln:

- Innerhalb desselben Namespace überschreibt späterer `value` früheren `value`.
- Innerhalb desselben Namespace und desselben `config`-Keys überschreibt späterer Wert früheren Wert.
- Config-Value kann nur `string | number | boolean` sein.

### Tags lesen

```typescript
import { getFieldTag, getFieldTags, tag } from '@defjs/core'

const field = UserBody.shape.name
const jsonTag = getFieldTag(field, tag.kind.json, 'name')
// { namespace: JsonTag, value: 'user_name', config: Map() }
```

## Field-Introspection

`getStructFields` expandiert ein Objekt-Schema in eine lesbare Feldliste, enthaltend Feld-Key, Sub-Schema und materialisierte Tags.

```typescript
import { getStructFields } from '@defjs/core'

const fields = getStructFields(UserBody)
// [
//   { key: 'id', struct: NumberSchema, tags: Map<symbol, FieldTag> },
//   { key: 'name', struct: StringSchema, tags: Map<symbol, FieldTag> },
// ]
```

Kombiniert mit `isObjectStruct` für sicheres Type-Checking vor Introspection:

```typescript
import { isObjectStruct, getStructFields } from '@defjs/core'

if (isObjectStruct(schema)) {
  for (const field of getStructFields(schema)) {
    console.log(field.key, field.tags.get(tag.kind.json)?.value)
  }
}
```

## Zero-Value-Fallback und Partieller Input

Der Struct-Parser folgt Go-`encoding/json`-Semantik:

1. **Fehlende Felder** → mit dem Zero-Value des Typs gefüllt, wirft nicht `missing_key`.
2. **Partieller Input** → erlaubt, nur einige Felder zu übergeben; nicht gesetzte Felder werden automatisch mit Zero-Values gefüllt.
3. **`undefined` und `null`** → `optional`-Felder geben `undefined` zurück; `nullable`-Felder geben `null` zurück; andere geben Zero-Values zurück.

```typescript
const Point = struct.object({ x: struct.number(), y: struct.number() })

struct.parseValue(Point, {}) // { x: 0, y: 0 }
struct.parseValue(Point, { x: 1 }) // { x: 1, y: 0 }
```

Das ist by design, kein Bug. Vorteile:

- Frontend-Formulare können nur geänderte Felder senden; das Backend erhält trotzdem eine komplette Struktur.
- Vermeidet `undefined`-Ausbreitung durch Objekte; Output ist immer sicher traversierbar.
- Konsistentes mentales Modell mit Gos JSON-Unmarshaling, vereinheitlicht Cross-Language-Kollaboration.

Falls du strikte Validierung brauchst (fehlende Felder sollen fehlern), prüfe explizit in der `build`-Funktion des Endpoints, oder verwende `struct.parseTuple`, um das `[error, value]`-Ergebnis selbst zu handhaben.

## Wie geht es weiter

- [Commands →](/core/commands) — Struct mit `defineRequest`, `defineEventStream` und `defineWebSocket` verwenden
- [HTTP →](/core/http) — Request-Body-Encoding und Response-Validierung
- [Context →](/core/context) — Auto-Build und Request-Builder-Fähigkeiten

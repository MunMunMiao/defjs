---
title: Struct
description: Declarative struct definition, type inference, error mapping, and the field alias support.
---

# Struct

`@defjs/core` bietet eine leichtgewichtige Struct-Fassade zum Deklarieren von Structta, Validieren von Inputs und Inferieren von Typen. Das Design-Intent ist modelliert nach Gos `encoding/json`: Zero-Value-Fallback, Akzeptieren partieller Input und stabiles, vorhersagbares Laufzeitverhalten.

## Primitive Typen

Alle Structta werden über den `struct`-Namespace erstellt, unterstützt Chain-Calls `.optional()`, `.null()`, `.nullish()` und `.alias(name)`.

### Skalare

```typescript
import { struct, type Infer } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  active: struct.boolean(),
  role: struct.literal('admin'),
})

type User = Infer<typeof User>
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

## Request-Structta

`struct.request(...)` organisiert `path`, `query`, `headers` und `body` in eine einzelne Input-Struktur für automatischen HTTP-Request-Build durch den Endpoint.

```typescript
const CreateUser = struct.request({
  path: struct.object({ orgId: struct.number() }),
  query: struct.object({ dryRun: struct.boolean().optional() }),
  headers: struct.object({
    'X-Api-Key': struct.string().alias('X-Api-Key'),
  }),
  body: struct.json(
    struct.object({
      name: struct.string().alias('user_name'),
    }),
  ),
})
```

Body-Wrapper bestimmen Transport-Encoding:

| Wrapper                    | Encoding           |
| -------------------------- | ------------------ |
| `struct.json(struct)`      | `JSON.stringify`   |
| `struct.urlencoded(shape)` | `URLSearchParams`  |
| `struct.formData(shape)`   | `FormData`         |
| `struct.text()`            | Plain text         |
| `struct.blob()`            | Binary Blob        |
| `struct.arrayBuffer()`     | Binary ArrayBuffer |

## `Infer<T>` Typ-Inferenz

`Infer<T>` extrahiert den Output-Typ eines Structs. Es ist der einzige Typ-Level-Helper, den du beherrschen musst.

```typescript
const Person = struct.object({
  name: struct.string(),
  age: struct.number().optional(),
})

type Person = Infer<typeof Person>
// { name: string; age?: number }
```

`Infer` funktioniert auch für `struct.array(...)`, `struct.union(...)`, `struct.request(...)`:

```typescript
type Tags = Infer<typeof Tags> // string[]
type Id = Infer<typeof Id> // string | number
type Req = Infer<typeof CreateUser> // { path: { orgId: number }; query?: { dryRun?: boolean }; ... }
```

## StructError und Error-Mapping

Falls Validierung fehlschlägt, gibt die Laufzeit `StructError` zurück, enthaltend ein komplettes `StructIssue[]`.

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

## Field Aliases

`.alias(name)` ist der einzige eingebaute Mechanismus für Field-Wire-Names. Es ändert den externen Key, den JSON-, Query-, Headers-, Path-, urlencoded- und FormData-Encoding/Decoding verwenden; es ändert nicht den TypeScript-Property-Namen, den Output-Typ, die Request-Section, den Body-Codec oder explizit in `build(ctx, input)` geschriebene Keys. Felder ohne Alias verwenden ihren Object-Field-Key.

```typescript
import { struct } from '@defjs/core'

const UserBody = struct.object({
  id: struct.number().alias('user_id'),
  name: struct.string().alias('user_name'),
})
```

The same alias is used by JSON, query, path params, headers, urlencoded bodies, and multipart bodies. If the same logical value needs different names in different targets, split the struct or write explicit keys in `build(ctx, input)`.

## Field Introspection

`getStructFields` expands an object struct into a readable field list containing field key, alias, and sub-struct.

```typescript
import { getStructFields } from '@defjs/core'

const fields = getStructFields(UserBody)
// [
//   { key: 'id', alias: 'user_id', struct: NumberStruct },
//   { key: 'name', alias: 'user_name', struct: StringStruct },
// ]
```

Combined with `isObjectStruct` for safe type checking before introspection:

```typescript
import { isObjectStruct, getStructFields } from '@defjs/core'

if (isObjectStruct(struct)) {
  for (const field of getStructFields(struct)) {
    console.log(field.key, field.alias)
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

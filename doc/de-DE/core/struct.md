---
title: Struct
description: Request- und Response-Shapes modellieren, Unknowns parsen und Wire-Bodies encoden.
---

# Struct

Modele einen Request (und seine Responses) als Structs. Du bekommst TypeScript-Types via `Infer` und Runtime-Checks via `struct.parse(...)` — kein Throw, Error-first-Tupel.

## Basic Setup

```typescript twoslash
import { defineRequest, struct, type Infer } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  active: struct.boolean(),
})

type User = Infer<typeof User>

const createUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.request({
    body: struct.json(
      struct.object({
        name: struct.string(),
        email: struct.string(),
      }),
    ),
  }),
  output: { 201: User },
})

const [parseError, user] = struct.parse(User, { id: 7, name: 'Ada', active: true })
if (!parseError) console.log(user.name)
void createUser
```

Geparster Output behält nur deklarierte Fields. Fehlende required Fields, falsche Primitives, schlechte nested Values, falsche Tuple-Length oder disallowed `null` → `StructError`, kein partial Value. Structs sind immutable; `.optional()` und Friends geben einen neuen Struct zurück.

## Required, optional, null

Presence und Nullability sind getrennt:

| Declaration                  | Missing / `undefined`                 | `null` | Valid Value            |
| ---------------------------- | ------------------------------------- | ------ | ---------------------- |
| `struct.string()`            | Reject                                | Reject | Accept String          |
| `struct.string().optional()` | Accept; absent Object-Field weglassen | Reject | Accept String          |
| `struct.string().null()`     | Reject                                | Accept | Accept String          |
| `struct.string().nullish()`  | Accept; absent Object-Field weglassen | Accept | Accept String          |
| `struct.null()`              | Reject                                | Accept | Andere Values rejecten |

```typescript twoslash
import { struct } from '@defjs/core'

const Profile = struct.object({
  name: struct.string(),
  nickname: struct.string().optional(),
  biography: struct.string().null(),
  note: struct.string().nullish(),
})

const [error, profile] = struct.parse(Profile, {
  name: 'Ada',
  biography: null,
  note: undefined,
})
if (error) throw error
console.log(profile.name, profile.nickname, profile.biography, profile.note)
```

Am Root kann optional `undefined` sein. Innerhalb eines Objects bleiben weggelassene optional/nullish Fields absent. In `struct.request(...)` kann eine all-optional Section weggelassen werden (normalisiert zu `{}`); eine Section mit required Field bleibt required. Body-Wrapper vorhanden → Body required, auch wenn innere Fields optional sind.

## Request-Body-Wrapper

`struct.request(...)` splittet `path`, `query`, `headers` und `body`. Bodies brauchen einen expliziten Codec:

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const createUser = defineRequest({
  method: 'POST',
  path: '/organizations/:organizationId/users',
  input: struct.request({
    path: struct.object({ organizationId: struct.string() }),
    query: struct.object({ notify: struct.boolean().optional() }),
    headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
})

const command = createUser({
  path: { organizationId: 'acme' },
  query: { notify: true },
  headers: { requestId: 'request-42' },
  body: { displayName: 'Ada' },
})
void command
```

| Wrapper                    | Geparster Wert   | Wire-Grenze                                                          |
| -------------------------- | ---------------- | -------------------------------------------------------------------- |
| `struct.json(inner)`       | Wert aus `inner` | JSON-Text, `application/json`                                        |
| `struct.text()`            | `string`         | Text, `text/plain;charset=UTF-8`                                     |
| `struct.urlencoded(shape)` | Shape-Object     | `URLSearchParams`, `application/x-www-form-urlencoded;charset=UTF-8` |
| `struct.formData(shape)`   | Shape-Object     | `FormData`; Platform setzt Multipart-Boundary                        |
| `struct.blob()`            | `Blob`           | Blob-Type oder `application/octet-stream`                            |
| `struct.file()`            | `File`           | Native `File` (Name + Type)                                          |
| `struct.arrayBuffer()`     | `ArrayBuffer`    | Buffer, `application/octet-stream`                                   |

`struct.file()` ist ein Value-Struct für Form-Fields — kein standalone `request.body`. Binary Bodies sind `struct.blob()` und `struct.arrayBuffer()`. Bare Object-/Array-/Primitive-Structs sind als `request.body` nicht gültig. SSE rejectet `body`. WebSocket-Request-Input rejectet `body` und `headers`.

## Aliasse

`.alias(...)` trennt logische Namen von Wire-Namen. `struct.parse(...)` nutzt logische Keys. JSON und flat Request-Codecs encoden Aliasse; JSON-Response-Decoding mappt Wire-Keys zurück auf logische Fields.

```typescript twoslash
import { struct } from '@defjs/core'

const User = struct.object({
  displayName: struct.string().alias('display_name'),
})

const [parseError, user] = struct.parse(User, { displayName: 'Ada' })
if (parseError) throw parseError
console.log(user.displayName)

const [wireError] = struct.parse(User, { display_name: 'Ada' })
console.log(wireError?.issues[0]?.path)
```

| Boundary                                          | Field                          |
| ------------------------------------------------- | ------------------------------ |
| `struct.parse(User, ...)`                         | Logisches `displayName`        |
| JSON-Request-Encoding                             | Wire `display_name`            |
| JSON-Response-Decoding                            | Wire → logisches `displayName` |
| Query-, Header-, URL-encoded-, Multipart-Encoding | Wire-Alias als Key             |

Aliasse funktionieren auf nested Fields, Arrays, Objects, Unions und Discriminators. Halte logische Namen im App-Code; packe externe Naming in den Struct.

## Parse-Failures

`struct.parse(...)` gibt `[null, value]` oder `[StructError, undefined]` zurück. `StructError` extends `Error` und exponiert `issues`, plus `format()`, `flatten()` und `prettify()`.

```typescript twoslash
import { struct, StructError } from '@defjs/core'

const User = struct.object({ id: struct.number(), name: struct.string() })
const [error, value] = struct.parse(User, { id: 'not-a-number' })

if (error) {
  console.log(error instanceof StructError)
  console.log(error.issues[0]?.code, error.issues[0]?.path)
  console.log(error.flatten().fieldErrors)
  console.log(error.format(), error.prettify())
}
void value
```

Ein `StructIssue` hat `code`, `expected`, `message`, `path` und `received`. Issues können untrusted Input halten — redact vor Logging oder Return. `struct.parse(..., { errorMap })` rewrites issue messages for that call only.

Struct-Validierung ist nur strukturell. Keine öffentlichen Range-, Format-, Refinement-, Auth- oder State-Transition-Rules. Mach diese Checks, bevor du einen Command baust.

## Reference

Öffentliche Constructors auf `@defjs/core` (Internals sind keine Facade-APIs):

```typescript twoslash
import { struct } from '@defjs/core'

const Any = struct.any()
const ArrayOfStrings = struct.array(struct.string())
const Bytes = struct.arrayBuffer()
const BigIntValue = struct.bigint()
const BlobValue = struct.blob()
const BooleanValue = struct.boolean()
const DateValue = struct.date()
const Discriminated = struct.discriminatedUnion('kind', [
  struct.object({ kind: struct.literal('created'), id: struct.number() }),
  struct.object({ kind: struct.literal('deleted'), id: struct.number() }),
])
const Status = struct.enum(['draft', 'published'])
const FileValue = struct.file()
const Form = struct.formData({ file: struct.file() })
const Combined = struct.intersection(struct.object({ id: struct.number() }), struct.object({ name: struct.string() }))
const JsonBody = struct.json(struct.object({ ok: struct.boolean() }))
const Literal = struct.literal('ready')
const NullValue = struct.null()
const NumberValue = struct.number()
const ObjectValue = struct.object({ id: struct.number() })
const Union = struct.or(struct.string(), struct.number())
const RecordValue = struct.record(struct.number())
const Request = struct.request({ path: struct.object({ id: struct.number() }) })
const StringValue = struct.string()
const TextBody = struct.text()
const Tuple = struct.tuple([struct.string(), struct.number()])
const Unknown = struct.unknown()
const FormUrlEncoded = struct.urlencoded({ name: struct.string() })

void [Any, ArrayOfStrings, Bytes, BigIntValue, BlobValue, BooleanValue, DateValue, Discriminated, Status, FileValue, Form, Combined]
void [
  JsonBody,
  Literal,
  NullValue,
  NumberValue,
  ObjectValue,
  Union,
  RecordValue,
  Request,
  StringValue,
  TextBody,
  Tuple,
  Unknown,
  FormUrlEncoded,
]
```

| Constructor                      | Input                                             | Inferierter Output              |
| -------------------------------- | ------------------------------------------------- | ------------------------------- |
| `struct.number()`                | Number außer `NaN`                                | `number`, inklusive ±`Infinity` |
| `struct.date()`                  | `Date`, Number oder Date-String                   | Gültiges `Date`                 |
| `struct.bigint()`                | `bigint` oder String akzeptiert von `BigInt(...)` | `bigint`                        |
| `struct.enum(...)`               | Deklariertes String- oder Number-Member           | Diese Literal-Union             |
| `struct.discriminatedUnion(...)` | Object mit required Literal-Discriminator         | Gewählter Object-Branch         |
| `struct.or(...)`                 | Erster matching Branch; Encoding prüft Ambiguity  | Union der Branch-Outputs        |
| `struct.intersection(...)`       | Values akzeptiert von jedem Member                | Intersection der Outputs        |
| `struct.record(value)`           | Plain Object, dessen Values `value` matchen       | Record der geparsten Values     |
| `struct.tuple(items)`            | Array exakt der deklarierten Length               | Fixed-Length-Tuple              |

Jeder Struct unterstützt `.alias(name)`, `.optional()`, `.null()` und `.nullish()`. `struct.discriminatedUnion` braucht Object-Options mit required Literal-Discriminator und rejectet Duplicates.

Importiere `struct`, `Infer`, `Struct`, `StructError` und verwandte öffentliche Types aus `@defjs/core`. Nutze `struct.parse(...)` als Parser. Importiere nicht `createObjectStruct`, Definition-Symbols, Codec-Internals oder `packages/core/src`.

Facade Non-Promises:

- Object-/Record-Outputs nutzen Null-Prototype — nimm `Object.prototype`-Methods nicht an.
- Unknown Object-Keys werden gedroppt.
- `struct.number()` rejectet `NaN`, akzeptiert Infinities.
- `struct.or(...)` versucht Branches in Order; rejectet ambiguous Encodings, wenn Branches disagree.
- `struct.intersection(...)` parst Members in Declaration-Order.
- Ein Struct validiert eine Grenze; er cached nicht, authorisiert nicht und besitzt keine Transport-Resource.

## Verwandte Rezepte

- [POST JSON](../recipes/post-json.md)
- [GET mit deklariertem 404](../recipes/get-declared-404.md)

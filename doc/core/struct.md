---
title: Struct
description: Model request and response shapes, parse unknowns, and encode wire bodies.
---

# Struct

Model a request (and its responses) as Structs. You get TypeScript types via `Infer`, and runtime checks via `struct.parse(...)` — no throw, error-first tuple.

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

Parsed output keeps only declared fields. Missing required fields, wrong primitives, bad nested values, wrong tuple length, or disallowed `null` → `StructError`, no partial value. Structs are immutable; `.optional()` and friends return a new Struct.

## Required, optional, null

Presence and nullability are separate:

| Declaration                  | Missing / `undefined`            | `null` | Valid value         |
| ---------------------------- | -------------------------------- | ------ | ------------------- |
| `struct.string()`            | Reject                           | Reject | Accept string       |
| `struct.string().optional()` | Accept; omit absent object field | Reject | Accept string       |
| `struct.string().null()`     | Reject                           | Accept | Accept string       |
| `struct.string().nullish()`  | Accept; omit absent object field | Accept | Accept string       |
| `struct.null()`              | Reject                           | Accept | Reject other values |

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

At the root, optional can be `undefined`. Inside an object, omitted optional/nullish fields stay absent. In `struct.request(...)`, an all-optional section can be omitted (normalized to `{}`); a section with a required field stays required. A body wrapper present → body required, even if inner fields are optional.

## Request body wrappers

`struct.request(...)` splits `path`, `query`, `headers`, and `body`. Bodies need an explicit codec:

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

| Wrapper                    | Parsed value       | Wire boundary                                                        |
| -------------------------- | ------------------ | -------------------------------------------------------------------- |
| `struct.json(inner)`       | Value from `inner` | JSON text, `application/json`                                        |
| `struct.text()`            | `string`           | Text, `text/plain;charset=UTF-8`                                     |
| `struct.urlencoded(shape)` | Shape’s object     | `URLSearchParams`, `application/x-www-form-urlencoded;charset=UTF-8` |
| `struct.formData(shape)`   | Shape’s object     | `FormData`; platform sets multipart boundary                         |
| `struct.blob()`            | `Blob`             | Blob type or `application/octet-stream`                              |
| `struct.file()`            | `File`             | Native `File` (name + type)                                          |
| `struct.arrayBuffer()`     | `ArrayBuffer`      | Buffer, `application/octet-stream`                                   |

`struct.file()` is a value Struct for form fields — not a standalone `request.body`. Binary bodies are `struct.blob()` and `struct.arrayBuffer()`. Bare object/array/primitive Structs are not valid as `request.body`. SSE rejects `body`. WebSocket request input rejects `body` and `headers`.

## Aliases

`.alias(...)` separates logical names from wire names. `struct.parse(...)` uses logical keys. JSON and flat request codecs encode aliases; JSON response decoding maps wire keys back to logical fields.

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

| Boundary                                       | Field                        |
| ---------------------------------------------- | ---------------------------- |
| `struct.parse(User, ...)`                      | Logical `displayName`        |
| JSON request encoding                          | Wire `display_name`          |
| JSON response decoding                         | Wire → logical `displayName` |
| Query, header, URL-encoded, multipart encoding | Wire alias as key            |

Aliases work on nested fields, arrays, objects, unions, and discriminators. Keep logical names in app code; put external naming in the Struct.

## Parse failures

`struct.parse(...)` returns `[null, value]` or `[StructError, undefined]`. `StructError` extends `Error` and exposes `issues`, plus `format()`, `flatten()`, and `prettify()`.

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

A `StructIssue` has `code`, `expected`, `message`, `path`, and `received`. Issues can hold untrusted input — redact before logging or returning. `struct.parse(..., { errorMap })` rewrites issue messages for that call only.

Struct validation is structural only. No public range, format, refinement, auth, or state-transition rules. Do those checks before you build a command.

## Reference

Public constructors on `@defjs/core` (internals are not facade APIs):

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

| Constructor                      | Input                                            | Inferred output                 |
| -------------------------------- | ------------------------------------------------ | ------------------------------- |
| `struct.number()`                | Number other than `NaN`                          | `number`, including ±`Infinity` |
| `struct.date()`                  | `Date`, number, or date string                   | Valid `Date`                    |
| `struct.bigint()`                | `bigint` or string accepted by `BigInt(...)`     | `bigint`                        |
| `struct.enum(...)`               | Declared string or number member                 | That literal union              |
| `struct.discriminatedUnion(...)` | Object with required literal discriminator       | Selected object branch          |
| `struct.or(...)`                 | First matching branch; encoding checks ambiguity | Union of branch outputs         |
| `struct.intersection(...)`       | Values accepted by every member                  | Intersection of outputs         |
| `struct.record(value)`           | Plain object whose values match `value`          | Record of parsed values         |
| `struct.tuple(items)`            | Array of exactly the declared length             | Fixed-length tuple              |

Every Struct supports `.alias(name)`, `.optional()`, `.null()`, and `.nullish()`. `struct.discriminatedUnion` needs object options with a required literal discriminator and rejects duplicates.

Import `struct`, `Infer`, `Struct`, `StructError`, and related public types from `@defjs/core`. Use `struct.parse(...)` as the parser. Don’t import `createObjectStruct`, definition symbols, codec internals, or `packages/core/src`.

Facade non-promises:

- Object/record outputs use a null prototype — don’t assume `Object.prototype` methods.
- Unknown object keys are dropped.
- `struct.number()` rejects `NaN`, accepts infinities.
- `struct.or(...)` tries branches in order; rejects ambiguous encodings when branches disagree.
- `struct.intersection(...)` parses members in declaration order.
- A Struct validates a boundary; it doesn’t cache, authorize, or own a transport resource.

## Related recipes

- [POST JSON](../recipes/post-json.md)
- [GET with a declared 404](../recipes/get-declared-404.md)

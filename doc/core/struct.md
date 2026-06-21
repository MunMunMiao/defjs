---
title: Struct
description: Declarative struct definition, type inference, error mapping, and the field alias support.
---

# Struct

`@defjs/core` provides a lightweight struct facade for declaring structs, validating inputs, and inferring types. The design intent is modeled after Go's `encoding/json`: zero-value fallback, accepting partial input, and stable, predictable runtime behavior.

## Primitive Types

All structs are created through the `struct` namespace, supporting chain calls `.optional()`, `.null()`, `.nullish()`, and `.alias(name)`.

### Scalars

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

Available scalars:

| Constructor            | Input Type                              | Output Type   | Zero Value           |
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

### Optional and Nullable

```typescript
const Profile = struct.object({
  bio: struct.string().optional(), // Output type: string | undefined
  age: struct.number().null(), // Output type: number | null
  nick: struct.string().nullish(), // Output type: string | null | undefined
})
```

### Enums and Literals

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

### Unions and Intersections

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

## Request Structs

`struct.request(...)` organizes `path`, `query`, `headers`, and `body` into a single input structure for automatic HTTP request building by the endpoint.

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

Body wrappers determine transport encoding:

| Wrapper                    | Encoding           |
| -------------------------- | ------------------ |
| `struct.json(struct)`      | `JSON.stringify`   |
| `struct.urlencoded(shape)` | `URLSearchParams`  |
| `struct.formData(shape)`   | `FormData`         |
| `struct.text()`            | Plain text         |
| `struct.blob()`            | Binary Blob        |
| `struct.arrayBuffer()`     | Binary ArrayBuffer |

## `Infer<T>` Type Inference

`Infer<T>` extracts the output type of a struct. It is the only type-level helper you need to master.

```typescript
const Person = struct.object({
  name: struct.string(),
  age: struct.number().optional(),
})

type Person = Infer<typeof Person>
// { name: string; age?: number }
```

`Infer` also works for `struct.array(...)`, `struct.union(...)`, `struct.request(...)`:

```typescript
type Tags = Infer<typeof Tags> // string[]
type Id = Infer<typeof Id> // string | number
type Req = Infer<typeof CreateUser> // { path: { orgId: number }; query?: { dryRun?: boolean }; ... }
```

## StructError and Error Mapping

When validation fails, the runtime returns `StructError` containing a complete `StructIssue[]`.

```typescript
import { struct, StructError } from '@defjs/core'

const [error, value] = struct.parseTuple(User, { id: 42 })
if (error) {
  console.log(error.issues)
  // [{ code: 'missing_key', path: ['name'], expected: 'string', received: undefined, message: '...' }]
}
```

### Error Formatting

```typescript
error.format() // Tree object { _errors: [], name: { _errors: ['...'] } }
error.flatten() // Flat object { formErrors: [], fieldErrors: { name: ['...'] } }
error.prettify() // String: "× name: Expected string, received undefined"
```

### Global Error Mapping

Replace default messages via `setErrorMap`:

```typescript
import { setErrorMap } from '@defjs/core'

setErrorMap((issue) => {
  if (issue.code === 'missing_key') {
    return `Field ${issue.path.join('.')} is required`
  }
  return undefined // Uncovered issues use default messages
})
```

## Field Aliases

`.alias(name)` is the only built-in field wire-name mechanism. It changes the external key used by JSON, query, headers, path, urlencoded and FormData encoding/decoding. It does not change the TypeScript property name, output type, request section, body codec, or keys written explicitly inside `build(ctx, input)`. Fields without an alias use their object field key.

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

## Zero-Value Fallback and Partial Input

The struct parser follows Go `encoding/json` semantics:

1. **Missing fields** → filled with the type's zero value, not throwing `missing_key`.
2. **Partial input** → allows passing only some fields; unset fields auto-filled with zero values.
3. **`undefined` and `null`** → `optional` fields return `undefined`; `nullable` fields return `null`; others return zero values.

```typescript
const Point = struct.object({ x: struct.number(), y: struct.number() })

struct.parseValue(Point, {}) // { x: 0, y: 0 }
struct.parseValue(Point, { x: 1 }) // { x: 1, y: 0 }
```

This is by design, not a bug. Benefits:

- Front-end forms can send only modified fields; the backend still receives a complete structure.
- Avoids `undefined` spreading through objects; output is always safely traversable.
- Consistent mental model with Go's json unmarshaling, unifying cross-language collaboration.

If you need strict validation (missing fields should error), explicitly check in the endpoint's `build` function, or use `struct.parseTuple` to handle the `[error, value]` result yourself.

## What's Next

- [Commands →](/core/commands) — Using struct with `defineRequest`, `defineEventStream`, and `defineWebSocket`
- [HTTP →](/core/http) — Request body encoding and response validation
- [Context →](/core/context) — Auto-build and request builder capabilities

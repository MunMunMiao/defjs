---
title: Struct
description: Declarative struct definition, type inference, error mapping, and the field alias support.
---

# Struct

`@defjs/core` provides a lightweight struct facade for declaring structs, validating inputs, and inferring types. The design intent is modeled after Go's `encoding/json`: zero-value defaulting, accepting partial input, and stable, predictable runtime behavior.

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
const Priority = struct.enum({ Low: 1, Medium: 2, High: 3 })

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
const Id = struct.or(struct.string(), struct.number())
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

`Infer` also works for `struct.array(...)`, `struct.or(...)`, `struct.request(...)`:

```typescript
type Tags = Infer<typeof Tags> // string[]
type Id = Infer<typeof Id> // string | number
type Req = Infer<typeof CreateUser>
// { path: { orgId: number }; query: { dryRun?: boolean }; headers: { 'X-Api-Key': string }; body: { name: string } }
```

## StructError and Error Mapping

`StructError` is the runtime container for `StructIssue[]`. Defjs may use it as the underlying `cause` of request/response validation failures, and you can also construct it directly when you want to format or propagate collected issues. Missing object fields are filled with zero values, so the common failure cases are invalid types, invalid enum/literal values, or union mismatches rather than `missing_key`. The public package intentionally does not export generic helpers like `struct.parseTuple(...)` or `struct.parseValue(...)`; parsing happens when Defjs consumes command input or transport data.

```typescript
import { StructError } from '@defjs/core'

const error = new StructError([
  {
    code: 'invalid_type',
    path: ['name'],
    expected: 'string',
    received: 42,
    message: 'Expected string at [name], received 42',
  },
])

console.log(error.issues)
```

### Error Formatting

```typescript
error.format() // Tree object { _errors: [], name: { _errors: ['...'] } }
error.flatten() // Flat object { formErrors: [], fieldErrors: { name: ['...'] } }
error.prettify() // String: "× name: Expected string at [name], received 42"
```

### Global Error Mapping

Replace default messages via `setErrorMap`:

```typescript
import { setErrorMap } from '@defjs/core'

setErrorMap((issue) => {
  if (issue.code === 'invalid_type') {
    return `Field ${issue.path.join('.')} has the wrong type`
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

Field introspection helpers such as `getStructFields(...)` and `isObjectStruct(...)` exist in internal modules and core tests, but they are not part of the public `@defjs/core` export surface. Public docs should treat aliases as a write-time/read-time encoding feature rather than promise runtime reflection APIs.

## Zero-Value Defaults and Partial Input

The struct parser follows Go `encoding/json` semantics:

1. **Missing fields** → filled with the type's zero value, not throwing `missing_key`.
2. **Partial input** → allows passing only some fields; unset fields auto-filled with zero values.
3. **`undefined` and `null`** → `optional` fields return `undefined`; `nullable` fields return `null`; others return zero values.

```typescript
const Point = struct.object({ x: struct.number(), y: struct.number() })

// Parsed command input / response data follows the same zero-value behavior:
// {} -> { x: 0, y: 0 }
// { x: 1 } -> { x: 1, y: 0 }
```

This is by design, not a bug. Benefits:

- Front-end forms can send only modified fields; the backend still receives a complete structure.
- Avoids `undefined` spreading through objects; output is always safely traversable.
- Consistent mental model with Go's json unmarshaling, unifying cross-language collaboration.

If you need strict validation (missing fields should error), explicitly check for required business fields in the endpoint's `build` function or before creating the command input.

## What's Next

- [Commands →](/core/commands) — Using struct with `defineRequest`, `defineEventStream`, and `defineWebSocket`
- [HTTP →](/core/http) — Request body encoding and response validation
- [Context →](/core/context) — Auto-build and request builder capabilities

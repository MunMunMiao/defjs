---
title: Struct
description: Declarative schema definition, type inference, error mapping, and the field tag system.
---

# Struct

`@defjs/core` provides a lightweight struct facade for declaring schemas, validating inputs, and inferring types. The design intent is modeled after Go's `encoding/json`: zero-value fallback, accepting partial input, and stable, predictable runtime behavior.

## Primitive Types

All schemas are created through the `struct` namespace, supporting chain calls `.optional()`, `.null()`, `.nullish()`, and `.tag(...)`.

### Scalars

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

## Request Schemas

`struct.request(...)` organizes `path`, `query`, `headers`, and `body` into a single input structure for automatic HTTP request building by the endpoint.

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

Body wrappers determine transport encoding:

| Wrapper                    | Encoding           |
| -------------------------- | ------------------ |
| `struct.json(schema)`      | `JSON.stringify`   |
| `struct.urlencoded(shape)` | `URLSearchParams`  |
| `struct.formData(shape)`   | `FormData`         |
| `struct.text()`            | Plain text         |
| `struct.blob()`            | Binary Blob        |
| `struct.arrayBuffer()`     | Binary ArrayBuffer |

## `Infer<T>` Type Inference

`struct.Infer<T>` extracts the output type of a schema. It is the only type-level helper you need to master.

```typescript
const Person = struct.object({
  name: struct.string(),
  age: struct.number().optional(),
})

type Person = struct.Infer<typeof Person>
// { name: string; age?: number }
```

`Infer` also works for `struct.array(...)`, `struct.union(...)`, `struct.request(...)`:

```typescript
type Tags = struct.Infer<typeof Tags> // string[]
type Id = struct.Infer<typeof Id> // string | number
type Req = struct.Infer<typeof CreateUser> // { path: { orgId: number }; query?: { dryRun?: boolean }; ... }
```

## StructError and Error Mapping

When validation fails, the runtime returns `StructError` containing a complete `SchemaIssue[]`.

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

## Tag System

Tags are metadata attached to fields, read by codecs, request builders, or external adapters. The core provides 6 built-in namespaces:

| Namespace               | Purpose                     | No-Arg Behavior                  |
| ----------------------- | --------------------------- | -------------------------------- |
| `tag.json()`            | JSON field wire key         | Falls back to field name         |
| `tag.urlencoded()`      | URL-encoded field wire key  | Falls back to field name         |
| `tag.multipart()`       | Multipart field wire key    | Falls back to field name         |
| `tag.query(fieldName)`  | Query parameter wire key    | **Must explicitly provide name** |
| `tag.uri(fieldName)`    | URI path parameter wire key | **Must explicitly provide name** |
| `tag.header(fieldName)` | HTTP header wire key        | **Must explicitly provide name** |

### Usage Example

```typescript
import { struct, tag } from '@defjs/core'

const UserBody = struct.object({
  id: struct.number().tag(tag.json('user_id')),
  name: struct.string().tag(tag.json('user_name')),
  email: struct.string().tag(tag.header('X-User-Email')),
})
```

### Custom Config Tag

`tag.defineConfig` allows third-party libraries to define their own namespace and config key:

```typescript
import { tag } from '@defjs/core'

const GormTag = tag.createTagNamespace('gorm')
const gorm = tag.defineConfig(GormTag)

const Model = struct.object({
  id: struct.number().tag(gorm('column', 'id'), gorm('primaryKey')),
})
```

Rules:

- Within the same namespace, later `value` overrides earlier `value`.
- Within the same namespace and same `config` key, later value overrides earlier value.
- Config value can only be `string | number | boolean`.

### Reading Tags

```typescript
import { getFieldTag, getFieldTags, tag } from '@defjs/core'

const field = UserBody.shape.name
const jsonTag = getFieldTag(field, tag.kind.json, 'name')
// { namespace: JsonTag, value: 'user_name', config: Map() }
```

## Field Introspection

`getStructFields` expands an object schema into a readable field list, containing field key, sub-schema, and materialized tags.

```typescript
import { getStructFields } from '@defjs/core'

const fields = getStructFields(UserBody)
// [
//   { key: 'id', struct: NumberSchema, tags: Map<symbol, FieldTag> },
//   { key: 'name', struct: StringSchema, tags: Map<symbol, FieldTag> },
// ]
```

Combined with `isObjectStruct` for safe type checking before introspection:

```typescript
import { isObjectStruct, getStructFields } from '@defjs/core'

if (isObjectStruct(schema)) {
  for (const field of getStructFields(schema)) {
    console.log(field.key, field.tags.get(tag.kind.json)?.value)
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

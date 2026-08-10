---
title: Struct
description: Describe strict structural decoding, required and optional input, aliases, and StructError handling.
---

# Struct

Structs describe strict structural decoding and wire encoding. Missing required values and invalid values fail instead of producing defaults.

Use the `struct` facade and `Infer<T>` from the root entry:

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

## Constructors

Common constructors include:

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

`struct.any()` and `struct.unknown()` accept any non-nullish value; use the same optional or nullable modifiers to admit `undefined` or `null`. Binary constructors are `struct.blob()`, `struct.file()`, and `struct.arrayBuffer()`.

Every Struct supports these modifiers:

```typescript
struct.string().optional()
struct.string().null()
struct.string().nullish()
struct.string().alias('wire_name')
```

## Strict Parsing

Use `struct.parse(schema, input)` to decode outside a command. It returns a fixed error-first tuple:

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

// profile is Infer<typeof Profile>
```

```typescript
type ParseResult<T> = [error: null, value: T] | [error: StructError, value: undefined]
```

Parsing follows one modifier contract:

| Input                  | Plain Struct | `.optional()` | `.null()` | `.nullish()` |
| ---------------------- | ------------ | ------------- | --------- | ------------ |
| missing or `undefined` | error        | accepted      | error     | accepted     |
| explicit `null`        | error        | error         | accepted  | accepted     |
| valid non-null value   | accepted     | accepted      | accepted  | accepted     |
| invalid non-null value | error        | error         | error     | error        |

Missing optional and nullish object fields are omitted from the output. At the top level they decode to `undefined`. `.null()` accepts explicit `null` but does not make a value optional.

Unknown object keys are dropped. Parsed object and record outputs use a null prototype. Code that depends on `Object.prototype` methods should use `Object.keys`, `Object.entries`, or copy into a normal object deliberately.

## Required Object and Request Input

Object properties are required at the TypeScript and runtime boundaries unless their Struct is optional or nullish. Every section declared in `struct.request(...)` is also required; sections that are not declared do not exist in the input type.

```typescript
const Input = struct.request({
  path: struct.object({ id: struct.string() }),
  query: struct.object({ page: struct.number().optional() }),
})

// Input is:
// { path: { id: string }; query: { page?: number } }
```

Omitting `query` is an error; `query: {}` is valid. Missing required fields, explicit `undefined`, prohibited `null`, and wrong runtime types fail the whole parse without exposing a partial value.

Composite Structs stop at the first determined issue. Objects use declaration order; arrays, records, and tuples use traversal order; intersections parse left before right. Tuple input must have exactly the declared length. `struct.or(...)` still tries alternatives in order, and `struct.discriminatedUnion(...)` still selects a declared branch.

When discriminator fields use aliases, `struct.discriminatedUnion(...)` reads the first wire discriminator that actually exists in option declaration order. After selecting a branch, it does not read any later option alias.

Structs enforce the declared structure, not application authorization, ranges, amounts, formats, or state transitions. There is no public refine/range/format DSL.

`struct.number()` accepts positive and negative `Infinity`; it excludes only `NaN` among JavaScript numbers. Apply finite, range, and domain checks in application code before creating a command. Do not put those checks in `build`, because `build` receives a schema-bound projection rather than caller runtime values.

## Request Bodies

`struct.request(...)` groups direct wire sections:

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

Body boundaries are:

| Struct                     | Encoding          |
| -------------------------- | ----------------- |
| `struct.json(inner)`       | JSON              |
| `struct.text()`            | Plain text        |
| `struct.urlencoded(shape)` | `URLSearchParams` |
| `struct.formData(shape)`   | `FormData`        |
| `struct.blob()`            | `Blob`            |
| `struct.arrayBuffer()`     | `ArrayBuffer`     |

See [Commands](/core/commands) for automatic request mapping and transport restrictions.

## Aliases

`.alias(name)` changes the wire key without changing the logical TypeScript key.

```typescript
const UserBody = struct.object({
  id: struct.number().alias('user_id'),
  displayName: struct.string().alias('display_name'),
})

// Caller input uses { id, displayName }.
// JSON wire data uses { user_id, display_name }.
```

Aliases decode and encode JSON keys. Automatic request building also uses them for outbound path, query, header, URL-encoded, and multipart keys. Callers continue to use logical keys. Explicit target keys in a custom `build` projection remain explicit.

## `StructError`

Failed structural decoding produces a `StructError`, often as `RequestError.cause`.

```typescript
import { StructError, type RequestError, type StructIssue } from '@defjs/core'

export function structIssues(error: RequestError): readonly StructIssue[] {
  if (error.kind === 'definition' && error.cause instanceof StructError) {
    return error.cause.issues
  }
  return []
}
```

A `StructError` exposes:

- `issues`, the original `StructIssue[]`;
- `format()`, a nested message tree;
- `flatten()`, top-level form and field messages;
- `prettify()`, a human-readable multiline string.

`StructIssue.received` can contain input or response data. Default messages can include a representation of that value. Paths and formatted keys can also originate in untrusted data, especially for records. Redact or review `issues`, messages, `format()`, `flatten()`, and `prettify()` before logging or returning them.

## Global Error Messages

`setErrorMap(...)` replaces message generation process-wide:

```typescript
import { setErrorMap } from '@defjs/core'

setErrorMap((issue) => {
  if (issue.code === 'invalid_type') {
    return `Invalid value at ${issue.path.join('.')}`
  }
  return undefined
})
```

The map is global, not client-scoped. Changing it affects later Struct issues in every client in the same JavaScript realm. Avoid request-specific state in the callback, and coordinate installation in applications that share a process.

## Next

- [Commands](/core/commands) maps Struct fields to requests and messages.
- [Errors](/core/errors) explains how Struct failures appear in execution tuples.
- [HTTP](/core/http) covers response decoding and representation errors.

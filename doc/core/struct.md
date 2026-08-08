---
title: Struct
description: Describe structural decoding, zero values, partial object input, aliases, and StructError handling.
---

# Struct

Structs describe structural decoding and wire encoding. Their selected zero-value behavior is inspired by Go, but it is not a complete implementation of Go's `encoding/json` semantics.

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

`struct.any()` and `struct.unknown()` accept unconstrained values. Binary constructors are `struct.blob()`, `struct.file()`, and `struct.arrayBuffer()`.

Every Struct supports these modifiers:

```typescript
struct.string().optional()
struct.string().null()
struct.string().nullish()
struct.string().alias('wire_name')
```

## Zero Values

Missing or `undefined` values decode to a zero value unless the Struct is optional. A non-nullable `null` follows the same zero-value path. A nullable Struct decodes missing, `undefined`, or `null` to `null`.

Selected zero values are:

| Struct                        | Zero value                                       |
| ----------------------------- | ------------------------------------------------ |
| `string`                      | `''`                                             |
| `number`                      | `0`                                              |
| `boolean`                     | `false`                                          |
| `bigint`                      | `0n`                                             |
| `date`                        | `new Date(0)`                                    |
| array                         | `[]`                                             |
| object                        | an object whose fields contain their zero values |
| tuple                         | a tuple whose items contain their zero values    |
| enum                          | the first declared value                         |
| literal                       | the declared literal                             |
| `blob`, `file`, `arrayBuffer` | an empty corresponding value                     |
| `any`, `unknown`              | `undefined`                                      |

Inside an object, a missing field marked only with `.optional()` is omitted from the decoded output. `.nullish()` is both optional and nullable; nullable handling takes precedence for a missing value, so it currently decodes to `null`.

```typescript
const Profile = struct.object({
  name: struct.string(),
  nickname: struct.string().optional(),
  biography: struct.string().null(),
})

// Decoding {} produces an object equivalent to:
// { name: '', biography: null }
```

Unknown object keys are dropped. Parsed object and record outputs use a null prototype. Code that depends on `Object.prototype` methods should use `Object.keys`, `Object.entries`, or copy into a normal object deliberately.

## Partial Input Is Intentional

Object input properties are optional at the TypeScript boundary, even when the decoded output property is present. Request sections in `struct.request(...)` are optional too.

```typescript
const Point = struct.object({
  x: struct.number(),
  y: struct.number(),
})

// A command using Point as input accepts {}.
// Structural decoding produces { x: 0, y: 0 }.
```

Do not describe these fields as required. Structs do not provide application-level required-field, authorization, range, amount, format, or state-transition validation. There is no public refine/range/format DSL.

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
- [HTTP](/core/http) covers response decoding and the current malformed-JSON limitation.

---
title: Struct
description: Model request 同 response shapes，parse unknowns，再 encode wire bodies。
---

# Struct

用 Structs model 一個 request（同佢嘅 responses）。你透過 `Infer` 拎 TypeScript types，再用 `struct.parse(...)` 做 runtime checks — 唔 throw，error-first tuple。

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

Parsed output 淨係保留 declared fields。Missing required fields、wrong primitives、bad nested values、wrong tuple length，或者 disallowed `null` → `StructError`，冇 partial value。Structs 係 immutable；`.optional()` 同朋友會 return 新 Struct。

## Required、optional、null

Presence 同 nullability 係分開嘅：

| Declaration                  | Missing / `undefined`            | `null` | Valid value         |
| ---------------------------- | -------------------------------- | ------ | ------------------- |
| `struct.string()`            | Reject                           | Reject | Accept string       |
| `struct.string().optional()` | Accept；omit absent object field | Reject | Accept string       |
| `struct.string().null()`     | Reject                           | Accept | Accept string       |
| `struct.string().nullish()`  | Accept；omit absent object field | Accept | Accept string       |
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

喺 root，optional 可以係 `undefined`。喺 object 入面，omitted optional/nullish fields 保持 absent。喺 `struct.request(...)`，全部 optional 嘅 section 可以 omit（normalize 成 `{}`）；有 required field 嘅 section 仍然 required。有 body wrapper → body required，即使 inner fields optional。

## Request body wrappers

`struct.request(...)` 分開 `path`、`query`、`headers` 同 `body`。Bodies 要 explicit codec：

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

| Wrapper                    | Parsed value          | Wire boundary                                                        |
| -------------------------- | --------------------- | -------------------------------------------------------------------- |
| `struct.json(inner)`       | 嚟自 `inner` 嘅 value | JSON text，`application/json`                                        |
| `struct.text()`            | `string`              | Text，`text/plain;charset=UTF-8`                                     |
| `struct.urlencoded(shape)` | Shape 嘅 object       | `URLSearchParams`，`application/x-www-form-urlencoded;charset=UTF-8` |
| `struct.formData(shape)`   | Shape 嘅 object       | `FormData`；platform set multipart boundary                          |
| `struct.blob()`            | `Blob`                | Blob type 或者 `application/octet-stream`                            |
| `struct.file()`            | `File`                | Native `File`（name + type）                                         |
| `struct.arrayBuffer()`     | `ArrayBuffer`         | Buffer，`application/octet-stream`                                   |

`struct.file()` 係 form fields 用嘅 value Struct — 唔係 standalone `request.body`。Binary bodies 係 `struct.blob()` 同 `struct.arrayBuffer()`。Bare object/array/primitive Structs 唔可以用做 `request.body`。SSE reject `body`。WebSocket request input reject `body` 同 `headers`。

## Aliases

`.alias(...)` 分開 logical names 同 wire names。`struct.parse(...)` 用 logical keys。JSON 同 flat request codecs encode aliases；JSON response decoding 會將 wire keys map 返去 logical fields。

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
| Query、header、URL-encoded、multipart encoding | Wire alias 做 key            |

Aliases 對 nested fields、arrays、objects、unions 同 discriminators 都有效。App code 用 logical names；external naming 放喺 Struct。

## Parse failures

`struct.parse(...)` return `[null, value]` 或者 `[StructError, undefined]`。`StructError` extends `Error`，暴露 `issues`，再加 `format()`、`flatten()` 同 `prettify()`。

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

`StructIssue` 有 `code`、`expected`、`message`、`path` 同 `received`。Issues 可以持有 untrusted input — log 或者 return 之前先 redact。`struct.parse(..., { errorMap })` 只覆蓋嗰一次 parse 嘅文案。

Struct validation 淨係 structural。冇 public range、format、refinement、auth 或者 state-transition rules。嗰啲 checks 喺你 build command 之前自己做。

## Reference

`@defjs/core` 上嘅 public constructors（internals 唔係 facade APIs）：

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

| Constructor                      | Input                                               | Inferred output            |
| -------------------------------- | --------------------------------------------------- | -------------------------- |
| `struct.number()`                | 除咗 `NaN` 以外嘅 number                            | `number`，包括 ±`Infinity` |
| `struct.date()`                  | `Date`、number，或者 date string                    | Valid `Date`               |
| `struct.bigint()`                | `bigint` 或者 `BigInt(...)` 接受嘅 string           | `bigint`                   |
| `struct.enum(...)`               | Declared string 或者 number member                  | 嗰個 literal union         |
| `struct.discriminatedUnion(...)` | 帶 required literal discriminator 嘅 object         | Selected object branch     |
| `struct.or(...)`                 | 第一個 matching branch；encoding 會 check ambiguity | Branch outputs 嘅 union    |
| `struct.intersection(...)`       | 每個 member 都接受嘅 values                         | Outputs 嘅 intersection    |
| `struct.record(value)`           | Values 符合 `value` 嘅 plain object                 | Parsed values 嘅 record    |
| `struct.tuple(items)`            | Exactly declared length 嘅 array                    | Fixed-length tuple         |

每個 Struct 都支援 `.alias(name)`、`.optional()`、`.null()` 同 `.nullish()`。`struct.discriminatedUnion` 要有 required literal discriminator 嘅 object options，並 reject duplicates。

由 `@defjs/core` import `struct`、`Infer`、`Struct`、`StructError` 同 related public types。用 `struct.parse(...)` 做 parser。唔好 import `createObjectStruct`、definition symbols、codec internals，或者 `packages/core/src`。

Facade non-promises：

- Object/record outputs 用 null prototype — 唔好假設有 `Object.prototype` methods。
- Unknown object keys 會被 drop。
- `struct.number()` reject `NaN`，accept infinities。
- `struct.or(...)` 按次序試 branches；branches 意見唔同時 reject ambiguous encodings。
- `struct.intersection(...)` 按 declaration order parse members。
- Struct validate 一個 boundary；佢唔會 cache、authorize，或者 own transport resource。

## Related recipes

- [POST JSON](../recipes/post-json.md)
- [GET with a declared 404](../recipes/get-declared-404.md)

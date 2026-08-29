---
title: Struct
description: Моделируй формы request и response, парси unknowns и кодируй wire bodies.
---

# Struct

Моделируй request (и его responses) как Structs. Получаешь TypeScript-типы через `Infer` и runtime-проверки через `struct.parse(...)` — без throw, error-first кортеж.

## Базовая настройка

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

Parsed output держит только объявленные поля. Missing required fields, wrong primitives, bad nested values, wrong tuple length или запрещённый `null` → `StructError`, без partial value. Structs immutable; `.optional()` и друзья возвращают новый Struct.

## Required, optional, null

Presence и nullability — раздельно:

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

На root optional может быть `undefined`. Внутри object omitted optional/nullish поля остаются absent. В `struct.request(...)` all-optional секцию можно опустить (нормализуется к `{}`); секция с required полем остаётся required. Wrapper тела есть → body required, даже если inner fields optional.

## Wrappers тела request

`struct.request(...)` делит `path`, `query`, `headers` и `body`. Телам нужен явный codec:

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
| `struct.formData(shape)`   | Shape’s object     | `FormData`; platform ставит multipart boundary                       |
| `struct.blob()`            | `Blob`             | Blob type или `application/octet-stream`                             |
| `struct.file()`            | `File`             | Native `File` (name + type)                                          |
| `struct.arrayBuffer()`     | `ArrayBuffer`      | Buffer, `application/octet-stream`                                   |

`struct.file()` — value Struct для form fields — не standalone `request.body`. Binary bodies — `struct.blob()` и `struct.arrayBuffer()`. Bare object/array/primitive Structs невалидны как `request.body`. SSE отклоняет `body`. WebSocket request input отклоняет `body` и `headers`.

## Алиасы

`.alias(...)` разделяет логические имена и wire-имена. `struct.parse(...)` использует логические ключи. JSON и flat request codecs кодируют алиасы; JSON response decoding мапит wire-ключи обратно в логические поля.

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

Алиасы работают на nested fields, arrays, objects, unions и discriminators. Держи логические имена в app-коде; внешнее именование клади в Struct.

## Сбои parse

`struct.parse(...)` возвращает `[null, value]` или `[StructError, undefined]`. `StructError` extends `Error` и даёт `issues`, плюс `format()`, `flatten()` и `prettify()`.

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

У `StructIssue` есть `code`, `expected`, `message`, `path` и `received`. Issues могут держать untrusted input — redact до лога или возврата. `struct.parse(..., { errorMap })` rewrites issue messages for that call only.

Struct validation — только structural. Нет публичных range, format, refinement, auth или state-transition правил. Делай эти проверки до сборки команды.

## Справка

Публичные constructors на `@defjs/core` (internals — не facade API):

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

Каждый Struct поддерживает `.alias(name)`, `.optional()`, `.null()` и `.nullish()`. `struct.discriminatedUnion` нуждается в object options с required literal discriminator и отклоняет duplicates.

Импортируй `struct`, `Infer`, `Struct`, `StructError` и связанные публичные типы из `@defjs/core`. Используй `struct.parse(...)` как parser. Не импортируй `createObjectStruct`, definition symbols, codec internals или `packages/core/src`.

Facade non-promises:

- Object/record outputs используют null prototype — не предполагай методы `Object.prototype`.
- Unknown object keys дропаются.
- `struct.number()` отклоняет `NaN`, принимает infinities.
- `struct.or(...)` пробует branches по порядку; отклоняет ambiguous encodings, когда branches не согласны.
- `struct.intersection(...)` парсит members в declaration order.
- Struct валидирует границу; он не кеширует, не authorize’ит и не владеет transport resource.

## Связанные рецепты

- [POST JSON](../recipes/post-json.md)
- [GET с объявленным 404](../recipes/get-declared-404.md)

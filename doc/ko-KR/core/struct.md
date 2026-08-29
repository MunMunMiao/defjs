---
title: Struct
description: 요청·응답 형태를 모델링하고, unknown을 파싱하고, 와이어 body를 인코딩해요.
---

# Struct

요청(과 그 응답)을 Struct로 모델링해요. `Infer`로 TypeScript 타입을, `struct.parse(...)`로 런타임 검사를 받아요 — throw 없이 error-first 튜플이에요.

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

파싱된 출력은 선언된 필드만 유지해요. 필수 필드 누락, 잘못된 원시값, 잘못된 중첩 값, 잘못된 튜플 길이, 허용되지 않은 `null` → `StructError`, 부분 값 없음. Struct는 불변이에요. `.optional()` 등은 새 Struct를 돌려줘요.

## 필수, optional, null

존재와 null 허용은 별개예요.

| Declaration                  | Missing / `undefined`       | `null` | Valid value    |
| ---------------------------- | --------------------------- | ------ | -------------- |
| `struct.string()`            | 거부                        | 거부   | 문자열 수락    |
| `struct.string().optional()` | 수락; 없는 객체 필드는 생략 | 거부   | 문자열 수락    |
| `struct.string().null()`     | 거부                        | 수락   | 문자열 수락    |
| `struct.string().nullish()`  | 수락; 없는 객체 필드는 생략 | 수락   | 문자열 수락    |
| `struct.null()`              | 거부                        | 수락   | 다른 값은 거부 |

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

루트에서 optional은 `undefined`일 수 있어요. 객체 안에서는 생략된 optional/nullish 필드가 없는 채로 남아요. `struct.request(...)`에서 전부 optional인 섹션은 생략할 수 있고 (`{}`로 정규화); 필수 필드가 있는 섹션은 필수예요. body 래퍼가 있으면 → 안쪽 필드가 optional이어도 body는 필수예요.

## 요청 body 래퍼

`struct.request(...)`는 `path`, `query`, `headers`, `body`를 나눠요. body에는 명시적 코덱이 필요해요.

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

| Wrapper                    | Parsed value  | Wire boundary                                                        |
| -------------------------- | ------------- | -------------------------------------------------------------------- |
| `struct.json(inner)`       | `inner`의 값  | JSON 텍스트, `application/json`                                      |
| `struct.text()`            | `string`      | 텍스트, `text/plain;charset=UTF-8`                                   |
| `struct.urlencoded(shape)` | shape의 객체  | `URLSearchParams`, `application/x-www-form-urlencoded;charset=UTF-8` |
| `struct.formData(shape)`   | shape의 객체  | `FormData`; 플랫폼이 multipart boundary 설정                         |
| `struct.blob()`            | `Blob`        | Blob 타입 또는 `application/octet-stream`                            |
| `struct.file()`            | `File`        | 네이티브 `File` (name + type)                                        |
| `struct.arrayBuffer()`     | `ArrayBuffer` | 버퍼, `application/octet-stream`                                     |

`struct.file()`은 form 필드용 값 Struct예요 — 단독 `request.body`가 아니에요. 바이너리 body는 `struct.blob()`과 `struct.arrayBuffer()`예요. 맨 object/array/primitive Struct는 `request.body`로 유효하지 않아요. SSE는 `body`를 거부해요. WebSocket 요청 입력은 `body`와 `headers`를 거부해요.

## 별칭

`.alias(...)`는 논리 이름과 와이어 이름을 분리해요. `struct.parse(...)`는 논리 키를 써요. JSON과 flat 요청 코덱은 별칭을 인코딩하고, JSON 응답 디코딩은 와이어 키를 논리 필드로 다시 매핑해요.

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

| Boundary                                     | Field                       |
| -------------------------------------------- | --------------------------- |
| `struct.parse(User, ...)`                    | 논리 `displayName`          |
| JSON 요청 인코딩                             | 와이어 `display_name`       |
| JSON 응답 디코딩                             | 와이어 → 논리 `displayName` |
| Query, header, URL-encoded, multipart 인코딩 | 키로 와이어 별칭            |

별칭은 중첩 필드, 배열, 객체, 유니온, discriminator에서 동작해요. 앱 코드에는 논리 이름을 두고, 외부 이름은 Struct에 두세요.

## 파싱 실패

`struct.parse(...)`는 `[null, value]` 또는 `[StructError, undefined]`를 돌려줘요. `StructError`는 `Error`를 확장하고 `issues`와 `format()`, `flatten()`, `prettify()`를 노출해요.

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

`StructIssue`에는 `code`, `expected`, `message`, `path`, `received`가 있어요. 이슈는 신뢰할 수 없는 입력을 담을 수 있어요 — 로그하거나 반환하기 전에 마스킹하세요. `struct.parse(..., { errorMap })` rewrites issue messages for that call only. 결정적이고 요청별 상태가 없게 유지하세요.

Struct 검증은 구조만이에요. 공개 range, format, refinement, 인증, 상태 전이 규칙은 없어요. 그런 검사는 명령을 만들기 전에 해요.

## Reference

`@defjs/core`의 공개 생성자예요 (내부는 facade API가 아니에요).

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

| Constructor                      | Input                                     | Inferred output            |
| -------------------------------- | ----------------------------------------- | -------------------------- |
| `struct.number()`                | `NaN`이 아닌 숫자                         | `number`, ±`Infinity` 포함 |
| `struct.date()`                  | `Date`, 숫자, 또는 날짜 문자열            | 유효한 `Date`              |
| `struct.bigint()`                | `bigint` 또는 `BigInt(...)`가 받는 문자열 | `bigint`                   |
| `struct.enum(...)`               | 선언된 문자열 또는 숫자 멤버              | 그 literal 유니온          |
| `struct.discriminatedUnion(...)` | 필수 literal discriminator가 있는 객체    | 선택된 객체 분기           |
| `struct.or(...)`                 | 첫 번째 맞는 분기; 인코딩은 모호성 검사   | 분기 출력의 유니온         |
| `struct.intersection(...)`       | 모든 멤버가 수락하는 값                   | 출력의 교집합              |
| `struct.record(value)`           | 값이 `value`와 맞는 plain 객체            | 파싱된 값의 Record         |
| `struct.tuple(items)`            | 선언 길이와 정확히 같은 배열              | 고정 길이 튜플             |

모든 Struct는 `.alias(name)`, `.optional()`, `.null()`, `.nullish()`를 지원해요. `struct.discriminatedUnion`은 필수 literal discriminator가 있는 객체 옵션이 필요하고 중복을 거부해요.

`struct`, `Infer`, `Struct`, `StructError`, 관련 공개 타입은 `@defjs/core`에서 import 하세요. 파서로는 `struct.parse(...)`를 쓰세요. `createObjectStruct`, 정의 심볼, 코덱 내부, `packages/core/src`는 import하지 마세요.

Facade non-promises:

- Object/record 출력은 null prototype을 써요 — `Object.prototype` 메서드를 가정하지 마세요.
- 알 수 없는 객체 키는 버려요.
- `struct.number()`는 `NaN`을 거부하고 infinity는 수락해요.
- `struct.or(...)`는 분기 순서로 시도하고, 분기가 어긋나면 모호한 인코딩을 거부해요.
- `struct.intersection(...)`는 선언 순서로 멤버를 파싱해요.
- Struct는 경계를 검증할 뿐, 캐시하거나 인가하거나 전송 리소스를 소유하지 않아요.

## 관련 레시피

- [POST JSON](../recipes/post-json.md)
- [선언된 404가 있는 GET](../recipes/get-declared-404.md)

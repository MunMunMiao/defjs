---
title: Struct
description: Declarative struct definition, type inference, error mapping, and the field alias support.
---

# Struct

`@defjs/core`는 스키마 선언, 입력 검증, 타입 추론을 위한 경량 struct 파사드를 제공해요. 설계 의도는 Go의 `encoding/json`에서 모델링했어요: 제로값 폴백, 부분 입력 허용, 안정적이고 예측 가능한 런타임 동작.

## 기본 타입

모든 스키마는 `struct` 네임스페이스를 통해 생성되며, 체인 호출 `.optional()`, `.null()`, `.nullish()`, `.alias(name)`를 지원해요.

### 스칼라

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

사용 가능한 스칼라:

| 생성자                 | 입력 타입                               | 출력 타입     | 제로값               |
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

### 선택적과 Nullable

```typescript
const Profile = struct.object({
  bio: struct.string().optional(), // 출력 타입: string | undefined
  age: struct.number().null(), // 출력 타입: number | null
  nick: struct.string().nullish(), // 출력 타입: string | null | undefined
})
```

### 열거형과 리터럴

```typescript
const Status = struct.enum(['pending', 'done', 'cancelled'])
const Priority = struct.objectEnum({ Low: 1, Medium: 2, High: 3 })

const Flag = struct.literal(true)
```

### 배열, 튜플, 레코드

```typescript
const Tags = struct.array(struct.string())
const Pair = struct.tuple([struct.string(), struct.number()])
const Dict = struct.record(struct.number())
```

### 유니온과 인터섹션

```typescript
const Id = struct.union([struct.string(), struct.number()])
const Named = struct.intersection(struct.object({ id: struct.number() }), struct.object({ name: struct.string() }))
```

### 판별 유니온

```typescript
const Event = struct.discriminatedUnion('kind', [
  struct.object({ kind: struct.literal('click'), x: struct.number(), y: struct.number() }),
  struct.object({ kind: struct.literal('key'), key: struct.string() }),
])
```

## 요청 스키마

`struct.request(...)`는 `path`, `query`, `headers`, `body`를 단일 입력 구조로 조직하여 엔드포인트가 자동으로 HTTP 요청을 빌드할 수 있게 해요.

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

바디 래퍼는 트랜스포트 인코딩을 결정해요:

| 래퍼                       | 인코딩            |
| -------------------------- | ----------------- |
| `struct.json(struct)`      | `JSON.stringify`  |
| `struct.urlencoded(shape)` | `URLSearchParams` |
| `struct.formData(shape)`   | `FormData`        |
| `struct.text()`            | 일반 텍스트       |
| `struct.blob()`            | 이진 Blob         |
| `struct.arrayBuffer()`     | 이진 ArrayBuffer  |

## `Infer<T>` 타입 추론

`Infer<T>`는 스키마의 출력 타입을 추출해요. 익혀야 할 유일한 타입 레벨 헬퍼예요.

```typescript
const Person = struct.object({
  name: struct.string(),
  age: struct.number().optional(),
})

type Person = Infer<typeof Person>
// { name: string; age?: number }
```

`Infer`는 `struct.array(...)`, `struct.union(...)`, `struct.request(...)`에도 동작해요:

```typescript
type Tags = Infer<typeof Tags> // string[]
type Id = Infer<typeof Id> // string | number
type Req = Infer<typeof CreateUser> // { path: { orgId: number }; query?: { dryRun?: boolean }; ... }
```

## StructError와 오류 매핑

검증에 실패하면 런타임은 완전한 `StructIssue[]`를 담은 `StructError`를 반환해요.

```typescript
import { struct, StructError } from '@defjs/core'

const [error, value] = struct.parseTuple(User, { id: 42 })
if (error) {
  console.log(error.issues)
  // [{ code: 'missing_key', path: ['name'], expected: 'string', received: undefined, message: '...' }]
}
```

### 오류 서식

```typescript
error.format() // 트리 객체 { _errors: [], name: { _errors: ['...'] } }
error.flatten() // 평면 객체 { formErrors: [], fieldErrors: { name: ['...'] } }
error.prettify() // 문자열: "× name: Expected string, received undefined"
```

### 전역 오류 매핑

`setErrorMap`으로 기본 메시지를 교체하세요:

```typescript
import { setErrorMap } from '@defjs/core'

setErrorMap((issue) => {
  if (issue.code === 'missing_key') {
    return `Field ${issue.path.join('.')} is required`
  }
  return undefined // 다루지 않는 이슈는 기본 메시지 사용
})
```

## Field Aliases

`.alias(name)`는 유일한 내장 필드 wire-name 메커니즘이에요. JSON, query, headers, path, urlencoded, FormData 인코딩/디코딩에서 쓰는 외부 key만 바꿔요. TypeScript 속성명, 출력 타입, request section, body codec, 그리고 `build(ctx, input)` 안에 명시적으로 쓴 object key는 바꾸지 않아요. alias가 없는 필드는 object field key를 wire key로 사용해요.

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

## 제로값 폴백과 부분 입력

struct 파서는 Go `encoding/json`의 의미를 따르며:

1. **누락된 필드** → 타입의 제로값으로 채우며 `missing_key`를 던지지 않아요.
2. **부분 입력** → 일부 필드만 전달해도 허용; 설정되지 않은 필드는 자동으로 제로값으로 채워져요.
3. **`undefined`와 `null`** → `optional` 필드는 `undefined`를 반환; `nullable` 필드는 `null`을 반환; 나머지는 제로값을 반환해요.

```typescript
const Point = struct.object({ x: struct.number(), y: struct.number() })

struct.parseValue(Point, {}) // { x: 0, y: 0 }
struct.parseValue(Point, { x: 1 }) // { x: 1, y: 0 }
```

이것은 의도적인 설계이며 버그가 아니에요. 장점:

- 프론트엔드 폼은 수정된 필드만 보낼 수 있고, 백엔드는 여전히 완전한 구조를 받아요.
- 객체에서 `undefined`가 전파되는 것을 방지; 출력은 항상 안전하게 탐색 가능해요.
- Go의 json unmarshaling과 일관된 멘탈 모델로, 언어 간 협업을 통일해요.

엄격한 검증(누락된 필드가 오류가 되어야 함)이 필요하면 엔드포인트의 `build` 함수에서 명시적으로 확인하거나, `struct.parseTuple`을 사용해 `[error, value]` 결과를 직접 처리하세요.

## 다음 단계

- [커맨드 →](/core/commands) — `defineRequest`, `defineEventStream`, `defineWebSocket`에서 struct 사용하기
- [HTTP →](/core/http) — 요청 바디 인코딩과 응답 검증
- [컨텍스트 →](/core/context) — 자동 빌드와 요청 빌더 기능

---
title: Struct
description: 구조적 디코딩, 제로 값, partial 객체 입력, alias, StructError 처리를 설명합니다.
---

# Struct

Struct는 구조적 디코딩과 wire 형식 인코딩을 설명합니다. 일부 제로 값 동작은 Go에서 영감을 받았지만 Go의 `encoding/json` 의미 전체를 구현한 것은 아닙니다.

root entry에서 `struct` facade와 `Infer<T>`를 사용하세요.

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

## Constructor

자주 쓰는 constructor는 다음과 같습니다.

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

`struct.any()`와 `struct.unknown()`은 제한 없이 값을 받습니다. 바이너리 constructor로는 `struct.blob()`, `struct.file()`, `struct.arrayBuffer()`가 있습니다.

모든 Struct는 다음 modifier를 지원합니다.

```typescript
struct.string().optional()
struct.string().null()
struct.string().nullish()
struct.string().alias('wire_name')
```

## 제로 값

Struct가 optional이 아니라면 누락되거나 `undefined`인 값은 제로 값으로 디코딩됩니다. nullable이 아닌 `null`도 같은 제로 값 경로를 따릅니다. nullable Struct는 누락, `undefined`, `null`을 `null`로 디코딩합니다.

주요 제로 값은 다음과 같습니다.

| Struct                        | 제로 값                            |
| ----------------------------- | ---------------------------------- |
| `string`                      | `''`                               |
| `number`                      | `0`                                |
| `boolean`                     | `false`                            |
| `bigint`                      | `0n`                               |
| `date`                        | `new Date(0)`                      |
| array                         | `[]`                               |
| object                        | 각 필드에 제로 값이 들어 있는 객체 |
| tuple                         | 각 항목에 제로 값이 들어 있는 튜플 |
| enum                          | 처음 선언한 값                     |
| literal                       | 선언한 literal                     |
| `blob`, `file`, `arrayBuffer` | 대응하는 빈 값                     |
| `any`, `unknown`              | `undefined`                        |

객체 안에서 `.optional()`만 지정한 필드가 누락되면 디코딩된 출력에서 생략됩니다. `.nullish()`는 optional이면서 nullable이고, 누락된 값에는 nullable 처리가 우선하므로 현재 `null`로 디코딩됩니다.

```typescript
const Profile = struct.object({
  name: struct.string(),
  nickname: struct.string().optional(),
  biography: struct.string().null(),
})

// Decoding {} produces an object equivalent to:
// { name: '', biography: null }
```

알 수 없는 객체 key는 버립니다. parse한 object와 record 출력은 null prototype을 사용합니다. `Object.prototype` method에 의존하는 코드는 `Object.keys`, `Object.entries`를 사용하거나 의도적으로 일반 객체에 복사해야 합니다.

## Partial 입력은 의도된 동작입니다

디코딩된 출력 property가 존재하더라도 TypeScript 경계에서는 객체 입력 property가 선택 사항입니다. `struct.request(...)`의 request section도 선택 사항입니다.

```typescript
const Point = struct.object({
  x: struct.number(),
  y: struct.number(),
})

// A command using Point as input accepts {}.
// Structural decoding produces { x: 0, y: 0 }.
```

이 필드를 필수 필드라고 설명하지 마세요. Struct는 애플리케이션 수준의 필수 입력, 인가, 범위, 금액, 형식 또는 상태 전이 검증을 제공하지 않습니다. 공개 API에는 refine/range/format DSL도 없습니다.

`struct.number()`는 양수와 음수 `Infinity`를 허용하고 JavaScript number 중 `NaN`만 제외합니다. 커맨드를 만들기 전에 애플리케이션 코드에서 finite, range, domain 검사를 적용하세요. `build`는 호출자 런타임 값이 아닌 스키마에 결합된 프로젝션을 받으므로 이런 검사를 `build`에 넣지 마세요.

## 요청 body

`struct.request(...)`는 wire section을 직접 묶습니다.

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

Body 경계는 다음과 같습니다.

| Struct                     | 인코딩            |
| -------------------------- | ----------------- |
| `struct.json(inner)`       | JSON              |
| `struct.text()`            | Plain text        |
| `struct.urlencoded(shape)` | `URLSearchParams` |
| `struct.formData(shape)`   | `FormData`        |
| `struct.blob()`            | `Blob`            |
| `struct.arrayBuffer()`     | `ArrayBuffer`     |

자동 요청 매핑과 트랜스포트 제한은 [커맨드](/ko-KR/core/commands)를 참고하세요.

## Alias

`.alias(name)`은 논리 TypeScript key를 바꾸지 않고 wire key만 바꿉니다.

```typescript
const UserBody = struct.object({
  id: struct.number().alias('user_id'),
  displayName: struct.string().alias('display_name'),
})

// Caller input uses { id, displayName }.
// JSON wire data uses { user_id, display_name }.
```

alias는 JSON key를 디코딩하고 인코딩합니다. 자동 요청 구성에서도 outbound path, query, header, URL-encoded, multipart key에 alias를 사용합니다. 호출자는 계속 논리 key를 사용합니다. 사용자 정의 `build` 프로젝션에 명시한 target key는 그대로 명시적입니다.

## `StructError`

구조적 디코딩 실패는 흔히 `RequestError.cause`로 `StructError`를 만듭니다.

```typescript
import { StructError, type RequestError, type StructIssue } from '@defjs/core'

export function structIssues(error: RequestError): readonly StructIssue[] {
  if (error.kind === 'definition' && error.cause instanceof StructError) {
    return error.cause.issues
  }
  return []
}
```

`StructError`는 다음 값을 제공합니다.

- 원본 `StructIssue[]`인 `issues`
- 중첩 메시지 tree인 `format()`
- 최상위 form 및 field 메시지인 `flatten()`
- 사람이 읽을 수 있는 여러 줄 문자열인 `prettify()`

`StructIssue.received`에는 입력 또는 응답 데이터가 들어갈 수 있습니다. 기본 메시지에도 해당 값을 표현한 내용이 포함될 수 있습니다. 특히 record에서는 path와 형식화된 key도 신뢰할 수 없는 데이터에서 올 수 있습니다. `issues`, 메시지, `format()`, `flatten()`, `prettify()`를 로그에 남기거나 반환하기 전에 검토하고 민감 정보를 마스킹하세요.

## 전역 오류 메시지

`setErrorMap(...)`은 프로세스 전체의 메시지 생성을 교체합니다.

```typescript
import { setErrorMap } from '@defjs/core'

setErrorMap((issue) => {
  if (issue.code === 'invalid_type') {
    return `Invalid value at ${issue.path.join('.')}`
  }
  return undefined
})
```

이 map은 클라이언트 범위가 아니라 전역입니다. 변경하면 같은 JavaScript 실행 환경의 모든 클라이언트에서 이후 생성되는 Struct issue에 영향을 줍니다. callback에 요청별 상태를 넣지 말고, 하나의 프로세스를 공유하는 애플리케이션에서는 설치 시점을 조율하세요.

## 다음 단계

- [커맨드](/ko-KR/core/commands)에서는 Struct 필드를 요청과 메시지에 매핑합니다.
- [오류](/ko-KR/core/errors)에서는 Struct 실패가 실행 튜플에 나타나는 방식을 설명합니다.
- [HTTP](/ko-KR/core/http)에서는 응답 디코딩과 현재 malformed JSON 제한을 설명합니다.

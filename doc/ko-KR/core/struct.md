---
title: Struct
description: 엄격한 구조 디코딩, 필수·선택 입력, alias, StructError 처리를 설명합니다.
---

# Struct

Struct는 엄격한 구조 디코딩과 wire 형식 인코딩을 설명합니다. 필수 값이 누락되거나 값이 유효하지 않으면 기본값을 만들지 않고 실패합니다.

root entry에서 `struct` facade와 `Infer<T>`를 사용하세요.

```typescript
import { struct, type Infer, type StructInput } from '@defjs/core'

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

`struct.any()`와 `struct.unknown()`은 `null`과 `undefined`를 제외한 모든 값을 받으며, 두 값을 허용할 때도 같은 modifier를 사용합니다. 바이너리 constructor로는 `struct.blob()`, `struct.file()`, `struct.arrayBuffer()`가 있습니다.

모든 Struct는 다음 modifier를 지원합니다.

```typescript
struct.string().optional()
struct.string().null()
struct.string().nullish()
struct.string().alias('wire_name')
```

## 엄격한 파싱

커맨드 밖에서 디코딩하려면 `struct.parse(schema, input)`를 사용하세요. 고정된 error-first 튜플을 반환합니다.

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
```

```typescript
type ParseResult<T> = [error: null, value: T] | [error: StructError, value: undefined]
```

모든 modifier에는 같은 규칙이 적용됩니다. 누락 값과 `undefined`는 `.optional()` 또는 `.nullish()`에서만, 명시적 `null`은 `.null()` 또는 `.nullish()`에서만 허용됩니다. `.null()`은 값을 optional로 만들지 않습니다.

누락된 optional 및 nullish 객체 필드는 출력에서 생략되고, 최상위에서는 `undefined`로 디코딩됩니다. 알 수 없는 key는 버리며, 디코딩한 object와 record 출력은 null prototype을 사용합니다.

Node의 strict deep equality는 prototype도 비교하므로 Struct로 파싱한 객체는 필드가 같은 객체 리터럴과 깊은 동등성을 갖지 않습니다. 이 경계를 명시적으로 확인하거나 assertion 안에서만 shallow copy를 만드세요.

```typescript
import assert from 'node:assert/strict'

const [error, profile] = struct.parse(struct.object({ name: struct.string() }), { name: 'Ada' })
assert.equal(error, null)
assert.equal(Object.getPrototypeOf(profile), null)
assert.deepEqual({ ...profile }, { name: 'Ada' })
```

이 spread는 assertion 전용 얕은 복사입니다. 중첩된 Struct 객체도 null prototype을 사용합니다. 테스트 matcher를 맞추기 위해서만 운영 경로에 전역 normalize 또는 clone 계층을 추가하지 마세요.

`exactOptionalPropertyTypes`를 활성화하면 추론된 객체 입력은 정확한 optional property를 사용합니다. optional 또는 nullish key에 `undefined`를 할당하지 말고 key 자체를 생략하세요.

```typescript
const OptionalProfile = struct.object({
  nickname: struct.string().optional(),
})

type OptionalProfileInput = StructInput<typeof OptionalProfile>

const omitted: OptionalProfileInput = {}
// @ts-expect-error With exactOptionalPropertyTypes, omit optional keys instead.
const explicitUndefined: OptionalProfileInput = { nickname: undefined }
```

런타임의 `struct.parse`는 unknown 입력에 포함된 명시적 `undefined`를 방어적으로 허용하고 해당 key를 생략합니다. 이 정규화가 정적으로 추론된 호출자 입력 타입을 넓히지는 않습니다.

## 필수 Object 및 Request 입력

Struct가 optional 또는 nullish가 아니면 객체 property는 TypeScript와 런타임 모두에서 필수입니다. `struct.request(...)`에 선언한 각 section도 필수이며, 선언하지 않은 section은 입력 타입에 나타나지 않습니다.

```typescript
const Input = struct.request({
  path: struct.object({ id: struct.string() }),
  query: struct.object({ page: struct.number().optional() }),
})

// { path: { id: string }; query: { page?: number } }
```

`query`를 생략하면 오류이고 `query: {}`는 유효합니다. 필수 필드 누락, 명시적 `undefined`, 금지된 `null`, 잘못된 런타임 타입은 부분 값을 반환하지 않고 전체 파싱을 실패시킵니다.

복합 Struct는 첫 번째로 확정된 issue에서 중단합니다. 튜플 입력 길이는 선언과 정확히 같아야 합니다. `struct.or(...)`는 계속 순서대로 대안을 시도하고 `struct.discriminatedUnion(...)`은 선언된 분기를 선택합니다.

discriminator 필드가 alias를 사용하면 `struct.discriminatedUnion(...)`은 option 선언 순서에 따라 실제로 존재하는 첫 wire discriminator를 읽습니다. 분기를 선택한 뒤에는 이후 option의 alias를 읽지 않습니다.

Struct는 선언한 구조만 강제하며 애플리케이션 인가, 범위, 금액, 형식, 상태 전이 규칙은 검증하지 않습니다. 공개 refine/range/format DSL도 없습니다.

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

const [logicalError, logicalUser] = struct.parse(UserBody, { id: 1, displayName: 'Ada' })
if (logicalError) throw logicalError

const [wireKeyError] = struct.parse(UserBody, { user_id: 1, display_name: 'Ada' })
if (!wireKeyError) throw new Error('struct.parse must read logical keys')
```

`logicalUser`는 `{ id, displayName }`을 사용하고, `wireKeyError`는 논리 key `id`가 없음을 가리킵니다. 공개 `struct.parse`는 논리 값만 읽으며 wire key를 단독 parse 입력으로 취급하지 않습니다.

transport JSON 인코딩/디코딩에서만 wire alias가 적용됩니다.

```typescript
import { createClient, defineRequest, withEndpoint, withHTTPHandle } from '@defjs/core'

let requestWireBody: unknown
const echoUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.request({ body: struct.json(UserBody) }),
  output: { 200: UserBody },
})
const client = createClient(
  withEndpoint('https://example.test'),
  withHTTPHandle(async (input, init) => {
    requestWireBody = await new Request(input, init).json()
    return Response.json({ user_id: 1, display_name: 'Ada' })
  }),
)

const [requestError, responseUser] = await client.execute(echoUser({ body: { id: 1, displayName: 'Ada' } }))
if (requestError) throw requestError
```

`requestWireBody`는 `{ user_id, display_name }`이고, `responseUser`는 다시 `{ id, displayName }`입니다. 자동 요청 구성에서도 outbound path, query, header, URL-encoded, multipart key에 alias를 사용합니다. 사용자 정의 `build` 프로젝션에 명시한 target key는 바뀌지 않습니다.

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
- [HTTP](/ko-KR/core/http)에서는 응답 디코딩과 표현 오류를 설명합니다.

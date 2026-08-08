---
title: 컨텍스트
description: HttpContext를 사용해 요청 범위 메타데이터를 HTTP 및 SSE 인터셉터 체인에 전달합니다.
---

# 컨텍스트

`HttpContext`는 token을 key로 사용하는 메타데이터 컨테이너입니다. HTTP 또는 SSE 실행과 함께 전달되며 인터셉터가 받는 `HttpRequest`에서 사용할 수 있습니다. URL, header, body에 스스로 직렬화되지는 않습니다.

## Token과 기본값

기본값 factory를 사용해 타입이 지정된 token을 만듭니다.

```typescript
import { makeHttpContextToken } from '@defjs/core'

const operationToken = makeHttpContextToken(() => 'unknown-operation')
const requestIdToken = makeHttpContextToken(() => 'missing-request-id')
```

context에 저장된 값이 없으면 `context.get(token)`이 token factory를 호출합니다. 기본값은 context에 삽입되지 않으므로 상태를 가진 factory는 누락된 값을 읽을 때마다 새 값을 만들 수 있습니다. 항상 같은 값을 반환하는 기본값을 사용하세요.

## Context 생성과 전달

```typescript
import { makeHttpContext } from '@defjs/core'

const context = makeHttpContext().set(operationToken, 'get-user').set(requestIdToken, 'request-42')

const [error, user] = await client.execute(getUser({ path: { id: 42 } }), {
  context,
})
```

`set(...)`은 context를 변경하고 chaining을 위해 같은 context를 반환합니다. `makeHttpContextToken(...)`으로 만들지 않은 값을 사용하면 `get(...)`과 `set(...)`이 `TypeError`를 던집니다.

인터셉터는 같은 객체를 읽습니다.

```typescript
import { createHttpInterceptor } from '@defjs/core'

const operationLogger = createHttpInterceptor(async (request, next) => {
  const operation = request.context?.get(operationToken) ?? 'unknown-operation'
  const requestId = request.context?.get(requestIdToken) ?? 'missing-request-id'

  console.info('outbound request started', { operation, requestId })
  const response = await next(request)
  console.info('outbound request finished', { operation, requestId, status: response.status })
  return response
})
```

고정된 operation 이름과 검토된 메타데이터만 사용하세요. 기본적으로 secret, 원본 header, body, URL, query string을 로그에 넣지 마세요.

## 참조 의미

실행은 `HttpContext`를 참조로 전달합니다. 인터셉터가 이를 변경하면 뒤쪽 인터셉터와 같은 객체를 가진 호출자도 변경을 볼 수 있습니다.

요청, 사용자, tenant, trace, cookie, 권한 정보가 들어 있다면 요청마다 새 context를 만드세요. 변경 가능한 context 하나를 동시에 실행되는 작업에서 재사용하면 메타데이터가 유출되거나 덮어써질 수 있습니다.

현재 HTTP와 SSE 실행 옵션은 `context`를 받지만 WebSocket 실행 옵션은 받지 않습니다. SSE 논리 핸들은 연결 시도에 사용한 request context를 유지합니다. 그래도 애플리케이션은 이 context를 스트림의 요청 범위가 소유하는 값으로 다뤄야 합니다.

## 복사와 병합

`makeHttpContext(existing)`는 token map을 얕게 복사합니다.

```typescript
const base = makeHttpContext().set(operationToken, 'list-users')
const copy = makeHttpContext(base)

copy.set(requestIdToken, 'request-43')
```

map은 분리되지만 저장된 객체 값은 깊게 복제되지 않습니다.

`makeHttpContext(entries)`는 token/value pair를 받습니다.

```typescript
const context = makeHttpContext([
  [operationToken, 'create-user'],
  [requestIdToken, 'request-44'],
])
```

`mergeHttpContexts(primary, secondary)`는 새 context를 반환합니다. 같은 token이 있으면 `secondary` 값이 `primary` 값을 교체합니다.

```typescript
import { mergeHttpContexts } from '@defjs/core'

const primary = makeHttpContext().set(operationToken, 'default-operation')
const secondary = makeHttpContext().set(operationToken, 'get-user')
const merged = mergeHttpContexts(primary, secondary)

merged.get(operationToken) // 'get-user'
```

context를 하나만 전달해도 복사본을 반환합니다. 둘 다 전달하지 않으면 빈 context를 반환합니다.

## Context API

| Member              | 동작                                                        |
| ------------------- | ----------------------------------------------------------- |
| `set(token, value)` | 값을 저장하고 같은 context를 반환합니다.                    |
| `get(token)`        | 저장된 값을 반환하거나 token의 기본값 factory를 호출합니다. |
| `has(token)`        | 값이 저장되어 있는지 확인합니다.                            |
| `del(token)`        | 값을 삭제하고 같은 context를 반환합니다.                    |
| `keys()`            | 저장된 token을 순회합니다.                                  |
| `length`            | 저장된 token 수입니다.                                      |

런타임 guard가 필요하면 `isHttpContext(...)`와 `isHttpContextToken(...)`을 사용할 수 있습니다.

요청 매핑은 별개의 관심사입니다. 자동 request section과 스키마 결합 프로젝션은 [커맨드](/ko-KR/core/commands)를, 체인 동작은 [인터셉터](/ko-KR/core/interceptors)를 참고하세요.

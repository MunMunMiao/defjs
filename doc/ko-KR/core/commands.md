---
title: 명령
description: 엔드포인트를 정의하고, opaque 명령을 만들고, 입력을 매핑하고, 전송 결과를 추론해요.
---

# 명령

정의 하나 → 빌더 → opaque 명령 → `client.execute`. HTTP, SSE, WebSocket이 같은 파이프라인이에요.

## Basic Setup

```typescript twoslash
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const health = defineRequest({ method: 'GET', path: '/health' })
const [error, data, response] = await client.execute(health())
if (!error) console.log(data, response.status)
```

## 정의 고르기

| 정의                     | 계약                                             | 성공 시 값                             |
| ------------------------ | ------------------------------------------------ | -------------------------------------- |
| `defineRequest(...)`     | 메서드, 상대 path, 선택 입력, 선택 status 출력   | 디코딩된 data + `HttpResponse`         |
| `defineEventStream(...)` | path, buffer/queue 한도, 이벤트 이름 → Struct 맵 | `EventStreamHandle` + open 스냅샷      |
| `defineWebSocket(...)`   | path, incoming 맵, 선택 outgoing 맵, queue 한도  | `WebSocketSession` + connection 스냅샷 |

`input`이 없으면 빌더는 인자를 받지 않아요. `input`이 있으면 중첩 필드가 전부 optional이어도 Struct 값을 넘겨요. optional `path` / `query` / `headers` 섹션은 생략할 수 있고, 필수 필드가 있는 섹션은 생략할 수 없어요. body 래퍼가 있으면 body는 필수예요.

명령은 opaque로 유지해요. 태그나 심볼을 파고들지 마세요.

## 자동 요청 매핑

논리 입력이 이미 path / query / headers / body를 가지면 `struct.request(...)`를 쓰세요.

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const createUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.request({
    body: struct.json(struct.object({ name: struct.string() })),
  }),
  output: { 201: struct.object({ id: struct.number(), name: struct.string() }) },
})
void createUser
```

별칭은 아웃바운드 와이어 키만 바꿔요. 파싱된 값과 명령 입력은 논리 이름을 유지해요.

## 커스텀 `build`

호출 형태와 와이어 형태가 다를 때 `build(request, input)`을 쓰세요. 제약된 투영이지, 인증 정책으로 분기하거나 부수 효과를 만들 자리는 아니에요.

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const search = defineRequest({
  method: 'GET',
  path: '/search',
  input: struct.object({ q: struct.string(), page: struct.number().optional() }),
  build(request, input) {
    request.withQuery({ q: input.q, page: input.page ?? 1 })
  },
  output: { 200: struct.object({ items: struct.array(struct.string()) }) },
})
void search
```

## status 출력 형태

`output`은 status → Struct 맵이거나 `{ status, body }[]`예요. 정확한 status가 이겨요. 배열 항목에서는 나중 매치가 앞선 그룹 매치를 덮어요. 맞는 선언이 없으면 body 디코딩 전에 `UNDECLARED_STATUS`예요.

## 관련 레시피

- [선언된 404가 있는 GET](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)

---
title: 클라이언트
description: 명시적인 클라이언트를 만들고, 옵션을 조합하고, 명령을 실행하고, 정리를 소유해요.
---

# 클라이언트

`Client`는 엔드포인트 + 전송 설정을 들고 HTTP, SSE, WebSocket 명령을 디스패치해요. 캐시하거나, 자동 재시도하거나, 열린 스트림을 대신 돌보지 않아요.

## Basic Setup

```typescript twoslash
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

## 옵션 조합하기

옵션은 왼쪽에서 오른쪽으로 적용돼요. setter는 교체하고, `withInterceptors(...items)`는 추가해요.

```typescript twoslash
import { createClient, createHttpInterceptor, withCredentials, withEndpoint, withInterceptors } from '@defjs/core'

const audit = createHttpInterceptor(async (request, next) => {
  const started = performance.now()
  const response = await next(request)
  console.info(request.operation ?? request.method, response.status, Math.round(performance.now() - started))
  return response
})

const client = createClient(withEndpoint('https://api.example.com'), withInterceptors(audit), withCredentials(true))
void client
```

혼합 인터셉터는 실행 시점에 전송별로 걸러지고, 선택된 종류 안에서의 상대 순서는 유지돼요.

## 전송별 실행

- HTTP → `[error, data, response]`
- SSE → `[error, stream, open]` (`open`은 시작 스냅샷이고, `stream.open`은 재연결 후 바뀔 수 있어요)
- WebSocket → `[error, session, connection]`

WebSocket 실행은 `beforeConnect`, `heartbeat`, `protocols`, `reconnect`를 덮어쓸 수 있어요. `timeout`은 `1..2_147_483_647` 범위의 양의 안전 정수여야 해요.

정리는 호출하는 쪽이 소유해요. HTTP는 abort, SSE는 닫고 `await stream.closed`, WebSocket은 닫고 `await session.closed`예요.

## 테스트 전송 주입하기

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint, withHTTPHandle } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({ path: struct.object({ id: struct.number() }) }),
  output: { 200: struct.object({ id: struct.number(), name: struct.string() }) },
})

const handle: typeof fetch = async () => Response.json({ id: 7, name: 'Ada' })
const client = createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(handle))
const [error, user] = await client.execute(getUser({ path: { id: 7 } }))
if (!error) console.log(user.name)
```

## 서버 vs 브라우저 범위

서버에서는 옵션이나 인터셉터 클로저가 인증, 쿠키, 사용자, 테넌트를 담을 때 요청 경계 안에서 클라이언트를 만들어요. 클라이언트 정체성만으로 보안 경계가 되지는 않아요.

## Reference

| Helper                                                                                                        | 효과                                                |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `withEndpoint(url)`                                                                                           | 모든 전송의 절대 base 엔드포인트                    |
| `withHTTPHandle(fetch)`                                                                                       | HTTP용 Fetch 교체                                   |
| `withSSEHandle(fetch)`                                                                                        | SSE용 Fetch 교체                                    |
| `withWebSocketHandle(WebSocket)`                                                                              | WebSocket 생성자 교체                               |
| `withInterceptors(...items)`                                                                                  | 혼합 인터셉터 추가                                  |
| `withQueryParamsSerializer(fn)`                                                                               | query 직렬화 교체                                   |
| `withCredentials(boolean)`                                                                                    | true일 때 HTTP/SSE에 Fetch `credentials: 'include'` |
| `withXSRF(options?)`                                                                                          | HTTP XSRF 쿠키 → 헤더                               |
| `withSSEReconnect` / `withSSEOnInvalidEvent`                                                                  | SSE 조절                                            |
| `withWebSocketReconnect` / `withWebSocketHeartbeat` / `withWebSocketProtocols` / `withWebSocketBeforeConnect` | WebSocket 조절                                      |

## 관련 레시피

- [로컬 Fetch 핸들로 테스트하기](../recipes/test-with-handle.md)
- [HTTP 호출 취소하기](../recipes/cancel-http.md)

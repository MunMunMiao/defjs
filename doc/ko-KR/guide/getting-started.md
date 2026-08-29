---
title: '시작하기: HTTP 요청 하나'
description: GET /users/:id를 정의하고, 로컬 Fetch 핸들로 실행한 뒤 실제 API로 연결해요.
---

# 시작하기: HTTP 요청 하나

`GET /users/:id`를 정의하고, 명시적인 클라이언트로 실행한 뒤 `200`과 선언된 `404`를 모두 디코딩해요. 로컬 핸들러로 첫 실행은 오프라인으로 두고, 실제 서비스로 바꿔도 명령은 그대로예요.

## Step 1 — 설치

`@defjs/core`는 ESM이고 Node.js 22+、Bun、Deno가 필요해요. Node가 `.ts`를 그대로 실행해요. package.json에 `"type": "module"`을 넣으세요. 브라우저에서는 번들러와 Fetch도 필요해요.

::: tabs
== bun

```sh
bun add @defjs/core
```

== npm

```sh
npm install @defjs/core
```

== pnpm

```sh
pnpm add @defjs/core
```

== yarn

```sh
yarn add @defjs/core
```

== deno

```sh
deno add npm:@defjs/core
```

:::

## Step 2 — 요청 정의하기

`src/get-user.ts`를 만들어요. `struct.request(...)`는 path 값을 query, 헤더, body와 분리해요.

```ts get-user.ts
import { defineRequest, struct } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
})

const NotFound = struct.object({
  message: struct.string(),
})

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: User },
    { status: 404, body: NotFound },
  ],
})

const command = getUser({ path: { id: 7 } })
void command
```

`defineRequest(...)`는 빌더를 돌려줘요. `getUser(...)`를 호출하면 `client.execute(...)`에 넘길 opaque 명령이 만들어져요.

## Step 3 — 로컬에서 실행하기

네트워크 없이 돌리도록 클라이언트 로컬 Fetch 핸들을 연결해요. Defjs는 여전히 입력을 검증하고, `Request`를 만들고, status로 분기하고, body를 파싱해요.

```ts get-user.ts
import { createClient, defineRequest, struct, withEndpoint, withHTTPHandle } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
})

const NotFound = struct.object({
  message: struct.string(),
})

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: User },
    { status: 404, body: NotFound },
  ],
})

const handle: typeof fetch = async (input, init) => {
  const request = new Request(input, init)
  const id = new URL(request.url).pathname.split('/').at(-1)

  if (id === '7') {
    return Response.json({ id: 7, name: 'Ada' }, { status: 200 })
  }

  return Response.json({ message: 'User not found' }, { status: 404 })
}

const client = createClient(withEndpoint('https://api.example.test'), withHTTPHandle(handle))

const [error, user, response] = await client.execute(getUser({ path: { id: 7 } }), {
  timeout: 5_000,
})

if (error) {
  if (error.kind === 'http' && error.status === 404) {
    console.log(error.data.message)
  } else {
    console.error(error.kind, error.code)
  }
} else {
  console.log(`Loaded ${user.name} from ${response.status}`)
}
```

실행해요:

::: tabs
== bun

```sh
bun src/get-user.ts
```

== npm

```sh
node src/get-user.ts
```

== pnpm

```sh
node src/get-user.ts
```

== yarn

```sh
node src/get-user.ts
```

== deno

```sh
deno run src/get-user.ts
```

:::

```txt
Loaded Ada from 200
```

없는 사용자를 시험해 보려면 path id를 `8`로 바꾸고 다시 실행해요:

```txt
User not found
```

성공 시: `error`는 `null`, `user`는 `200` Struct 출력, `response`는 `HttpResponse`예요. 선언된 `404`에서는 `error.kind`가 `'http'`, `error.status`가 `404`, `error.data`는 타입이 잡힌 `NotFound`예요. 실패 시 튜플 두 번째 항목은 `undefined`예요.

## Step 4 — 실제 API로 연결하기

서비스가 그 body로 `GET /v1/users/:id`를 구현하면 `withHTTPHandle(...)`을 빼고 실제 base URL을 설정해요.

```ts
import { createClient, withEndpoint, withHTTPHandle } from '@defjs/core'

const localHandle: typeof fetch = async (input, init) => {
  const request = new Request(input, init)
  const id = new URL(request.url).pathname.split('/').at(-1)

  if (id === '7') {
    return Response.json({ id: 7, name: 'Ada' }, { status: 200 })
  }

  return Response.json({ message: 'User not found' }, { status: 404 })
}

const localClient = createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(localHandle))
const realClient = createClient(withEndpoint('https://api.example.com/v1'))
void localClient
void realClient
```

명령은 같고, 클라이언트만 달라요.

## 결과가 달라질 때

- 잘못된 입력 / 잘못된 빌드 / 충돌하는 취소 옵션 → `REQUEST_VALIDATION_FAILED`
- 선언된 non-2xx → 타입이 잡힌 `error.data`와 함께 `HTTP_STATUS`
- 선언된 body가 디코딩되지 않음 → `RESPONSE_VALIDATION_FAILED`
- 선언이 없는 status → `UNDECLARED_STATUS` (body 디코딩 전)
- Fetch 실패 / 취소 / 타임아웃 → `NETWORK_ERROR` / `ABORTED` / `TIMEOUT`

`timeout`은 `1..2_147_483_647` 범위의 양의 안전 정수여야 해요. `abort`와 `timeout`을 함께 넘기지 마세요. `signal`은 둘 중 하나와 조합할 수 있어요. 취소는 호출자가 본 결과를 알려 줄 뿐, 서버 쓰기가 커밋됐는지는 증명하지 않아요.

## 다음 레시피

- [선언된 404가 있는 GET](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
- [HTTP 호출 취소하기](../recipes/cancel-http.md)
- [SSE 스트림 소비하기](../recipes/consume-sse.md)
- [WebSocket 세션 열기](../recipes/websocket-session.md)
- [로컬 Fetch 핸들로 테스트하기](../recipes/test-with-handle.md)

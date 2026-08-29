---
title: 로컬 Fetch 핸들로 테스트하기
description: withHTTPHandle로 한 클라이언트의 Fetch만 바꾸고 명령은 그대로 둬요.
---

# 로컬 Fetch 핸들로 테스트하기

`withHTTPHandle(...)`는 그 클라이언트의 Fetch만 바꿔요. URL 구성, 인터셉터, status 디스패치, Struct 디코딩은 그대로 받고 — DNS, TLS, 실제 서버는 없어도 돼요.

자세한 내용은 [클라이언트](../core/client.md)를 보세요.

```ts get-user.test.ts
import { createClient, defineRequest, struct, withEndpoint, withHTTPHandle } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ message: struct.string() }),
  },
})

const handle: typeof fetch = async (input, init) => {
  const request = new Request(input, init)
  const id = new URL(request.url).pathname.split('/').at(-1)
  if (id === '7') return Response.json({ id: 7, name: 'Ada' }, { status: 200 })
  return Response.json({ message: 'User not found' }, { status: 404 })
}

const client = createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(handle))
const [error, user, response] = await client.execute(getUser({ path: { id: 7 } }))

if (error) throw error
console.log(user.name, response.status)
```

```txt
Ada 200
```

프로덕션에서는 같은 `getUser` 명령을 실제 `withEndpoint(...)` 클라이언트에 쓰면 돼요 — 핸들만 바뀌어요.

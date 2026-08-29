---
title: 宣言済み 404 付きの GET
description: GET を 1 回実行し、型付き 200 と宣言済み 404 で分岐します。
---

# 宣言済み 404 付きの GET

成功と 404 のボディの両方を宣言します。`error.kind` と `error.status` で分岐すると、宣言済みの miss に対して型付きの `error.data` が得られます。

詳細は [HTTP](../core/http.md) と [Errors](../core/errors.md) を見てください。

```ts get-user.ts
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ],
})

const [error, user, response] = await client.execute(getUser({ path: { id: 7 } }))

if (error?.kind === 'http' && error.status === 404) {
  console.log(error.data.message)
} else if (error) {
  console.error(error.kind, error.code)
} else {
  console.log(`Loaded ${user.name} from ${response.status}`)
}
```

```txt
Loaded Ada from 200
```

未宣言の status はボディデコードの前に `UNDECLARED_STATUS` になります — 気にする status はすべて宣言してください。

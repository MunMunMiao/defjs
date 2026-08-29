---
title: Publish an HTTP SDK without hiding execute
description: Export builders and createClient; keep status narrowing at the call site.
---

# Publish an HTTP SDK without hiding execute

A method SDK that swallows `client.execute` usually collapses declared `404` into an untyped throw or a shared “API error”. Keep the contract as builders plus an explicit client; callers still own status branching.

See [Commands](../core/commands.md), [Client](../core/client.md), and [Design Decisions](../guide/design-decisions.md).

```ts users-sdk.ts
import { createClient, defineRequest, struct, withEndpoint, withHTTPHandle, type Client, type ClientOption } from '@defjs/core'

export const getUser = defineRequest({
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

export function createUsersClient(...options: ClientOption[]): Client {
  return createClient(withEndpoint('https://api.example.com'), ...options)
}

export async function loadUserName(client: Client, id: number): Promise<string> {
  const [error, user] = await client.execute(getUser({ path: { id } }))
  if (error?.kind === 'http' && error.status === 404) {
    throw new Error(error.data.message)
  }
  if (error) throw error
  return user.name
}
```

```ts app.ts
import { createUsersClient, getUser, loadUserName } from './users-sdk.ts'
import { withHTTPHandle } from '@defjs/core'

const handle: typeof fetch = async () => Response.json({ id: 7, name: 'Ada' }, { status: 200 })

const client = createUsersClient(withHTTPHandle(handle))
const name = await loadUserName(client, 7)
const [error, user] = await client.execute(getUser({ path: { id: 7 } }))

console.log(name, error, user?.name)
```

```txt
Ada null Ada
```

Export builders and a client factory. Helpers may call `execute` for one reviewed path, but do not replace the tuple for every status you care about.

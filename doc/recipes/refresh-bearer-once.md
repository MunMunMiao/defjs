---
title: Refresh a Bearer token once on 401
description: Attach Authorization and replay once inside one interceptor; next() only goes inward.
---

# Refresh a Bearer token once on 401

`next()` is the rest of **this** onion — not `axios(config)` re-dispatch from the outside. Put attach + single-flight refresh + one replay in **one** HTTP interceptor so outer layers do not run twice.

See [Interceptors](../core/interceptors.md).

```ts refresh-bearer.ts
import { createClient, createHttpInterceptor, defineRequest, struct, withEndpoint, withHTTPHandle, withInterceptors } from '@defjs/core'

const getInvoice = defineRequest({
  method: 'GET',
  path: '/v1/invoice',
  output: [
    { status: 200, body: struct.object({ total: struct.number() }) },
    { status: 401, body: struct.object({ code: struct.literal('expired_token') }) },
  ],
})

type Credential = { accessToken: string }

function refreshingBearer(read: () => Credential, refresh: (stale: Credential) => Promise<Credential>) {
  let flight: Promise<Credential> | undefined

  return createHttpInterceptor(async (request, next) => {
    const authorize = (credential: Credential) => {
      const headers = new Headers(request.headers)
      headers.set('authorization', `Bearer ${credential.accessToken}`)
      return { ...request, headers }
    }

    const used = read()
    const response = await next(authorize(used))
    const body = response.body
    if (response.status !== 401 || typeof body !== 'object' || body === null || !('code' in body) || body.code !== 'expired_token') {
      return response
    }

    const current = read()
    if (current.accessToken !== used.accessToken) return next(authorize(current))

    flight ??= refresh(used).finally(() => {
      flight = undefined
    })
    const refreshed = await flight
    return next(authorize(refreshed))
  })
}

let credential: Credential = { accessToken: 'v1' }
const handle: typeof fetch = async (_input, init) => {
  const auth = new Headers(init?.headers).get('authorization')
  if (auth === 'Bearer v1') return Response.json({ code: 'expired_token' }, { status: 401 })
  return Response.json({ total: 42 }, { status: 200 })
}

const client = createClient(
  withEndpoint('https://billing.example.test'),
  withHTTPHandle(handle),
  withInterceptors(
    refreshingBearer(
      () => credential,
      async () => {
        credential = { accessToken: 'v2' }
        return credential
      },
    ),
  ),
)

const [error, invoice] = await client.execute(getInvoice())
console.log(error, invoice?.total)
```

```txt
null 42
```

Calling `next` again only re-enters interceptors **inside** this layer (and the Fetch handler). It does not re-run outer timing/auth wrappers — that is why 401 layout belongs in one interceptor, not a second `execute`.

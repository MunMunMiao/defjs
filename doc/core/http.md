---
title: HTTP
description: Define a request, execute it, branch on status, and cancel with signal or timeout.
---

# HTTP

Define → execute → branch on the tuple → cancel when the screen goes away. That’s the whole HTTP loop.

## Basic Setup

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({ path: struct.object({ id: struct.number() }) }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ],
})

const [error, data, response] = await client.execute(getUser({ path: { id: 7 } }))
if (error?.kind === 'http' && error.status === 404) {
  console.log(error.data.message)
} else if (!error) {
  console.log(data.name, response.status)
}
```

## Resolve the URL

`withEndpoint(...)` needs a valid absolute URL. Endpoint pathname stays as a directory; query and hash are discarded before command resolution.

```ts
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com/v1'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
    query: struct.object({ fields: struct.string().optional() }),
  }),
})

const command = getUser({ path: { id: 'a/b' }, query: { fields: 'name' } })
void client.execute(command)
// → https://api.example.com/v1/users/a%2Fb?fields=name
```

Path placeholders are raw scalars, encoded exactly once. Empty values and `.` / `..` are rejected. Slashes, `?`, `#`, `%`, spaces, and Unicode in one placeholder stay one encoded segment — don’t pre-encode.

Definition path can’t contain `?` or `#`, and can’t be absolute or protocol-relative. Default query encoder accepts scalars and arrays of scalars. Nested/complex query values need `withQueryParamsSerializer(...)` or construction fails.

## Encode input

`struct.request(...)` keeps path, query, headers, and body separate. The body wrapper picks the codec and content type:

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const updateUser = defineRequest({
  method: 'PATCH',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
    headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
  output: {
    200: struct.object({ id: struct.number(), displayName: struct.string().alias('display_name') }),
  },
})

const [error, user] = await client.execute(
  updateUser({
    path: { id: 7 },
    headers: { requestId: 'request-42' },
    body: { displayName: 'Ada' },
  }),
)
if (error) console.error(error.code)
else console.log(user.id)
```

Aliases rewrite outbound wire keys only. Parsed values and command inputs keep logical names.

| Wrapper                    | Runtime body      | Default content type                                           |
| -------------------------- | ----------------- | -------------------------------------------------------------- |
| `struct.json(inner)`       | JSON string       | `application/json`                                             |
| `struct.text()`            | string            | `text/plain;charset=UTF-8`                                     |
| `struct.urlencoded(shape)` | `URLSearchParams` | `application/x-www-form-urlencoded;charset=UTF-8`              |
| `struct.formData(shape)`   | `FormData`        | Platform multipart boundary; Defjs clears stale `Content-Type` |
| `struct.blob()`            | `Blob`            | Blob type or `application/octet-stream`                        |
| `struct.arrayBuffer()`     | `ArrayBuffer`     | `application/octet-stream`                                     |

Custom `build` exposes the same location/codec setters. Final body write wins (value + content-type metadata). High-level commands don’t turn an arbitrary object into a body — declare a wrapper or use the matching setter.

## Dispatch by status

`output` is a status → Struct map or `{ status, body }[]`. With `output` and no `responseType`, representation defaults to `json`. Explicit types: `json`, `text`, `blob`, `arraybuffer`.

Order of operations:

1. Status `0` → transport error.
2. No `output` → 2xx succeeds with `data === undefined`; non-2xx → `HTTP_STATUS` with `error.data === undefined`. Body not decoded.
3. With `output`, exact declared status selects its Struct. Array form: later match overrides earlier grouped match.
4. Undeclared status → `UNDECLARED_STATUS` (`kind: 'definition'`). The response may still be present (including a Fetch representation on `error.response.body`); that body is not Struct-decoded as success.
5. Representation failure → `RESPONSE_VALIDATION_FAILED`, no partial data.
6. Decoded declared 2xx → result; decoded declared non-2xx → typed `error.data` on `HTTP_STATUS`.

`HttpResponse` has `url`, `status`, `statusText`, `headers`, `body`, `error`, and `ok`. `ok` means only `200 <= status < 300`. It’s a Defjs value, not a native `Response`. Without `output`, `responseType` is not allowed.

## Cancel the work

Execution options take `signal` plus either `abort` or `timeout`. **`abort` and `timeout` are mutually exclusive.** `signal` can combine with either.

```ts
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const command = defineRequest({ method: 'GET', path: '/report' })()
const controller = new AbortController()
const pending = client.execute(command, { signal: controller.signal, timeout: 5_000 })

controller.abort('screen closed')
const [error] = await pending
if (error?.kind === 'transport' && error.code === 'ABORTED') {
  console.log('caller cancellation')
}
```

`timeout` must be a positive safe integer in `1..2_147_483_647`. Recognized cancel → `ABORTED`; execution timeout → `TIMEOUT`; interceptor `throw` → `INTERCEPTOR_FAILED`; other Fetch failures → `NETWORK_ERROR`. Cancel after the server accepted a write does **not** prove the write rolled back.

## Credentials and XSRF

`withCredentials(true)` sets Fetch `credentials: 'include'` for HTTP and SSE. It does not create `Authorization` and does not configure WebSocket auth. `false` leaves credentials unspecified.

`withXSRF(...)` is HTTP-only. Defaults: `cookieName: 'XSRF-TOKEN'`, `headerName: 'X-XSRF-TOKEN'`. Header injects only for non-safe methods, only when the caller didn’t already set it, and only for same-origin browser requests. Skips `GET`, `HEAD`, `OPTIONS`, `TRACE`. Outside a browser, pass a synchronous request-scoped `tokenProvider` if you need injection.

Keep credentials, XSRF tokens, and query strings out of routine logs. Don’t use query params as a general credential channel.

## Progress and the Fetch boundary

`onDownloadProgress` runs while an explicit response representation is read. `lengthComputable` is true only with a positive `Content-Length`. No `responseType` → no body decode → no body-read progress.

`onUploadProgress` watches a `ReadableStream<Uint8Array>` request body as Fetch reads it. Normal body wrappers don’t expose a raw stream setter — upload progress is mainly for low-level construction.

`fetchHandler(httpRequest, fetchImpl?)` is the lower-level Fetch boundary: builds a native `Request`, calls Fetch, reads the representation, returns `HttpResponse`. It does **not** validate command input, dispatch `output`, or run interceptors. Useful for injected transport tests — not a substitute for `client.execute`.

## Replay limits

Defjs does **not** auto-retry HTTP. Retrying a read still needs a reviewed timeout/network/duplicate policy. Retrying a mutation needs replayable bytes, server support, an idempotency key bound to auth scope + request bytes, and a receiver duplicate policy.

A client/command/Fetch boundary can’t know if a failed write committed. Keep replay decisions in the app or a reviewed interceptor. Interceptors can short-circuit or replace the low-level request; the final status and body must still satisfy the command’s contract.

## Related recipes

- [GET with a declared 404](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
- [Cancel an HTTP call](../recipes/cancel-http.md)
- [Test with a local Fetch handle](../recipes/test-with-handle.md)

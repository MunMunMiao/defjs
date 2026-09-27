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
  output: struct.object({ id: struct.number(), name: struct.string() }),
  error: struct.object({ message: struct.string() }),
})

const [error, data, response] = await client.execute(getUser({ path: { id: 7 } }))
if (error?.code === 'HTTP_STATUS' && error.status === 404) {
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
  output: struct.object({ id: struct.number(), displayName: struct.string().alias('display_name') }),
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

## How a body is read

`output` is one Struct for the 2xx body; `error` is one Struct for everything else. With either
declared and no `responseType`, the representation defaults to `json`. Explicit types: `json`,
`text`, `blob`, `arraybuffer`. With neither declared, `responseType` is not allowed and the body is
never read.

Order of operations:

1. `ok` picks the side: `output` for 2xx, `error` for everything else. Never both.
2. Nothing declared for that side → the body is never read. 2xx succeeds with `data === undefined`;
   non-2xx is `HTTP_STATUS` with `data === undefined`. An unreadable body on a side you did not
   declare is ignored, including the fact that it could not be read.
3. The media type is checked **before** the body is read. A mismatch is `RES_MEDIA_TYPE_INVALID` and
   nothing is parsed or decoded.
4. The representation is read. A failure is `RES_DECODE_FAILED`.
5. The Struct parses the value. A failure is `RES_STRUCT_MISMATCH`.
6. 2xx → result and a typed `response.body`; non-2xx → typed `data` on `HTTP_STATUS`.

Decoding happens once, after the interceptor chain, so a response an interceptor built with
`makeResponse(...)` is read exactly like one off the wire.

A successful response is a `DecodedResponse<T>`: `url`, `status`, `statusText`, `headers`, `ok`, and
a typed `body`. Where nothing was decoded you get `HttpMeta` — the same fields without `body`. `ok`
means only `200 <= status < 300`. Neither is a native `Response`. A transport failure is a fault, so
there is no status-0 response standing in for one.

## Cancel the work {#cancel-the-work}

Execution options take `signal` plus either `abort` or `timeout`. **`abort` and `timeout` are mutually exclusive.** `signal` can combine with either.

```ts
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const command = defineRequest({ method: 'GET', path: '/report' })()
const controller = new AbortController()
const pending = client.execute(command, { signal: controller.signal, timeout: 5_000 })

controller.abort('screen closed')
const [error] = await pending
if (error?.code === 'NET_ABORTED') {
  console.log('caller cancellation')
}
```

`timeout` must be a positive safe integer in `1..2_147_483_647`. Recognized cancel → `NET_ABORTED`; execution timeout → `NET_TIMEOUT`; interceptor `throw` → `EXT_INTERCEPTOR_FAILED`; other Fetch failures → `NET_UNREACHABLE`. Cancel after the server accepted a write does **not** prove the write rolled back.

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

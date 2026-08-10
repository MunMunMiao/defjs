---
title: HTTP
description: Build HTTP URLs and bodies, dispatch response Structs, cancel work, configure credentials and XSRF, and understand the Fetch boundary.
---

# HTTP

`defineRequest(...)` creates an HTTP command builder. [Commands](./commands.md) covers definitions and input projections; this page owns HTTP wire and lifecycle behavior.

## URL Construction

`withEndpoint(...)` must provide an absolute base URL. Its path is kept as a directory:

```typescript
const client = createClient(withEndpoint('https://api.example.com/v1'))

const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
})

// Resolves to https://api.example.com/v1/users
```

A missing trailing slash is added to the base path. Any query or hash on the base endpoint is discarded.

Endpoint `path` values are relative contract paths. A leading slash is accepted and removed before resolution, so it does not replace the base directory. The runtime rejects:

- absolute URLs and protocol-relative URLs;
- paths containing `?`;
- paths containing `#`.

Path placeholders use `:name`:

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
  }),
})
```

Pass raw placeholder values. Defjs serializes each scalar, rejects an empty value or the complete value `.` or `..`, and applies `encodeURIComponent` exactly once before substitution. `/`, `?`, `#`, `%`, spaces, and Unicode stay within one path segment. Do not pre-encode values: `%` is treated as raw input and encoded to `%25`.

## Request Encoding

Use `struct.request(...)` for direct wire mapping:

```typescript
const createUser = defineRequest({
  method: 'POST',
  path: '/organizations/:organizationId/users',
  input: struct.request({
    path: struct.object({ organizationId: struct.string() }),
    query: struct.object({ notify: struct.boolean().optional() }),
    headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
})
```

Body Structs select encoding and default content type:

| Body Struct                | Wire body             | Default `Content-Type`                            |
| -------------------------- | --------------------- | ------------------------------------------------- |
| `struct.json(inner)`       | `JSON.stringify(...)` | `application/json`                                |
| `struct.text()`            | string                | `text/plain;charset=UTF-8`                        |
| `struct.urlencoded(shape)` | `URLSearchParams`     | `application/x-www-form-urlencoded;charset=UTF-8` |
| `struct.formData(shape)`   | `FormData`            | set by the platform, including its boundary       |
| `struct.blob()`            | `Blob`                | Blob type or `application/octet-stream`           |
| `struct.arrayBuffer()`     | `ArrayBuffer`         | `application/octet-stream`                        |

A custom `build` can use the corresponding HTTP builder methods. Setter methods replace that request part; `addHeaders`, `addFormData`, and `addFormUrlEncoded` append to the current part. All values must come from the schema-bound projection.

### Query Values

The default query encoder accepts flat scalar values and arrays of scalar values. Nested objects fail during request building.

`withQueryParamsSerializer((params, rawParams) => string)` can change how already accepted flat values are rendered. It receives a `URLSearchParams` view and the encoded flat record. It does not make nested query objects valid; those are rejected before serialization.

Aliases become outbound query, path, and header keys. Caller code still uses logical Struct field names.

## Status and Output Decoding

`output` maps status codes to response Structs:

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})
```

The runtime chooses the Struct by the exact status. Any unmatched status produces `UNDECLARED_STATUS` when `output` is declared. Declared 2xx bodies form the success-data union; declared non-2xx bodies form `error.data`.

`response.ok` means only `status >= 200 && status < 300`. It does not mean output decoding, application validation, or authorization succeeded.

When `output` is declared and `responseType` is omitted, response parsing defaults to `json`. Explicit modes are `json`, `text`, `blob`, and `arraybuffer`. The selected Struct then performs structural decoding. If `output` is omitted, `responseType` is not accepted, result data is `undefined`, and the returned response wrapper has `body: null`. The runtime makes a best-effort cancellation of the response body instead of reading or decoding it.

Command result classification has a fixed priority: status 0 transport failure → no `output` → exact status match or `UNDECLARED_STATUS` → `response.error` → Struct decoding. Body representation errors can therefore occur only when `output` is declared; an undeclared-status branch still takes precedence if Fetch recorded one.

### Representation Errors

For an exactly matched declared output, if JSON or another body codec fails, Fetch keeps the original exception in `HttpResponse.error`. Command execution stops before applying the output Struct and returns `[RESPONSE_VALIDATION_FAILED, undefined, response]`; the codec exception is retained as the error `cause`, and no typed `error.data` is produced.

An ordinary non-2xx response does not populate `response.error`. Its status is represented by `status` and `ok`. When the non-2xx status and body are declared and the body is valid, the Struct is decoded and the resulting `HTTP_STATUS` error retains the typed body in `error.data`.

## The HTTP Result

```typescript
const [error, data, response] = await client.execute(getUser({ path: { id: 42 } }))
```

On success, `response` is a Defjs `HttpResponse` wrapper whose body matches `data`. On failure, response availability depends on how far execution progressed. See [Errors](./errors.md) for the exact taxonomy.

## Cancellation and Timeout

HTTP execution accepts `abort`, `signal`, and `timeout`:

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  signal: controller.signal,
  timeout: 5_000,
})
```

`signal` is merged with the client's internal signal and with a positive timeout. The separate `abort` field is an alternative cancellation signal retained by the current API. `abort` and `timeout` cannot be supplied together; doing so returns `REQUEST_VALIDATION_FAILED`. `signal` can be combined with either one.

For HTTP, SSE, and WebSocket execution, `timeout` must be a positive safe integer in `1..2_147_483_647`; `0`, negative or fractional values, `NaN`, `Infinity`, and values above the limit return `REQUEST_VALIDATION_FAILED` before any request, stream, or socket resource is created.

A recognized cancellation produces `ABORTED`. An `AbortSignal.timeout(...)` reason or an execution timeout produces `TIMEOUT`. Other Fetch failures produce `NETWORK_ERROR`.

Those outcomes describe what the caller observed; they do not prove that the server did not receive or commit a request. A write can time out after delivery and before its response reaches the caller. Do not retry a write as a new operation merely because its first tuple reported `TIMEOUT`, `ABORTED`, or `NETWORK_ERROR`. Preserve one operation identity across allowed replays and make the receiver reserve that identity, bind it to the authenticated scope and request bytes, and persist the result atomically with the side effect. The `examples/resilience-idempotency-key` project demonstrates the contract with an in-memory receiver; production deduplication must use durable atomic storage.

## Credentials and XSRF

`withCredentials(true)` sets Fetch `credentials: 'include'` for HTTP and SSE. `false` leaves the Fetch option unspecified; it does not force `omit`. This setting does not add an `Authorization` header and does not configure WebSocket authentication.

`withXSRF(...)` applies only to HTTP requests. The defaults are:

```typescript
withXSRF({
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
})
```

Injection is skipped for the RFC safe methods `GET`, `HEAD`, `OPTIONS`, and `TRACE`. Every other method, including custom unsafe methods such as `PROPPATCH`, uses the same existing-header, same-origin, and token guards before injection. An existing configured header is preserved. Browser cookie lookup is limited to same-origin requests. Outside a browser, provide a synchronous `tokenProvider`; it takes precedence over cookie lookup.

```typescript
import type { HttpRequest } from '@defjs/core'

declare const readRequestScopedToken: (request: HttpRequest) => string | null

withXSRF({
  tokenProvider: ({ request }) => readRequestScopedToken(request),
})
```

Keep server token providers request-scoped. `withCredentials(true)` does not make cross-origin browser cookies readable to JavaScript and does not cause cross-origin XSRF header injection. Keep the server fail-closed when the token is missing or invalid; client-side header injection is only one part of server-side XSRF validation.

## Progress Observers

`onDownloadProgress` reports bytes while the Fetch response body is read. `lengthComputable` is true only when a positive `Content-Length` is available.

```typescript
declare const updateProgress: (value: number | undefined) => void

const [error, file] = await client.execute(downloadFile(), {
  onDownloadProgress({ loaded, total, lengthComputable }) {
    updateProgress(lengthComputable ? loaded / total : undefined)
  },
})
```

`onUploadProgress` only observes a `ReadableStream<Uint8Array>` request body. The current high-level command builders expose Blob and ArrayBuffer projection setters, but no raw stream setter. As a result, there is no standard `defineRequest` example that can supply the stream required by this option. Do not present a constructed stream as a working high-level command body.

Progress callbacks run in the transport read/write path. Keep them non-throwing and inexpensive.

## Low-Level Fetch Boundary

`fetchHandler(httpRequest, fetchImpl?)` is exported. It converts the Defjs `HttpRequest` into a native `Request`, calls Fetch, parses the selected response representation, and returns a Defjs `HttpResponse` wrapper. Fetch failures become status-0 wrappers.

Calling `fetchHandler` directly bypasses:

- command input decoding and request projection;
- HTTP output status dispatch and Struct decoding;
- client interceptor orchestration;
- conversion to the high-level `RequestError` tuple.

It is an exported low-level boundary, not the recommended command workflow. Its long-term stability commitment is not established here.

## Next

- [Interceptors](./interceptors.md) covers request cloning, short-circuiting, and retry.
- [Errors](./errors.md) documents HTTP status, transport, and definition failures.
- [Struct](./struct.md) explains strict structural decoding.

---
title: HTTP
description: Build HTTP URLs and bodies, dispatch response Structs, cancel work, configure credentials and XSRF, and understand the Fetch boundary.
---

# HTTP

`defineRequest(...)` creates an HTTP command builder. [Commands](/core/commands) covers definitions and input projections; this page owns HTTP wire and lifecycle behavior.

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

Placeholder values are inserted without path-segment encoding. Constrain identifiers or call `encodeURIComponent` on one untrusted segment before creating the command. An unencoded slash or dot segment can change the resolved path; an inserted `?` or `#` causes endpoint-path validation to reject the request.

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

When `output` is declared and `responseType` is omitted, response parsing defaults to `json`. Explicit modes are `json`, `text`, `blob`, and `arraybuffer`. The selected Struct then performs structural decoding. If `output` is omitted, result data is `undefined` and the returned response wrapper has `body: null`.

### Current Malformed-JSON Defect

::: danger Malformed JSON can appear successful
The current Fetch boundary stores a JSON parse failure in `HttpResponse.error` and leaves the body as `null`. HTTP command execution does not check that parse error before applying the output Struct. Because a non-nullable `null` can decode to a Struct zero value, a malformed 2xx JSON body can currently produce `[null, zeroValue, response]`.

Do not treat a zero-valued success as proof that the server sent valid JSON. This needs an implementation fix and regression test; documentation is only a warning.
:::

## The HTTP Result

```typescript
const [error, data, response] = await client.execute(getUser({ path: { id: 42 } }))
```

On success, `response` is a Defjs `SettledResponse` wrapper whose body matches `data`. On failure, response availability depends on how far execution progressed. See [Errors](/core/errors) for the exact taxonomy.

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

A recognized cancellation produces `ABORTED`. An `AbortSignal.timeout(...)` reason or an execution timeout produces `TIMEOUT`. Other Fetch failures produce `NETWORK_ERROR`.

## Credentials and XSRF

`withCredentials(true)` sets Fetch `credentials: 'include'` for HTTP and SSE. `false` leaves the Fetch option unspecified; it does not force `omit`. This setting does not add an `Authorization` header and does not configure WebSocket authentication.

`withXSRF(...)` applies only to HTTP requests. The defaults are:

```typescript
withXSRF({
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
})
```

Injection is attempted only for `POST`, `PUT`, `PATCH`, and `DELETE`. An existing configured header is preserved. Browser cookie lookup is limited to same-origin requests. Outside a browser, provide a synchronous `tokenProvider`; it takes precedence over cookie lookup.

```typescript
import type { HttpRequest } from '@defjs/core'

declare const readRequestScopedToken: (request: HttpRequest) => string | null

withXSRF({
  tokenProvider: ({ request }) => readRequestScopedToken(request),
})
```

Keep server token providers request-scoped. `withCredentials(true)` does not make cross-origin browser cookies readable to JavaScript and does not cause cross-origin XSRF header injection.

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

- [Interceptors](/core/interceptors) covers request cloning, short-circuiting, and retry.
- [Errors](/core/errors) documents HTTP status, transport, and definition failures.
- [Struct](/core/struct) explains zero-value structural decoding.

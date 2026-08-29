---
title: Errors
description: Branch on kind and code for 404s, timeouts, undeclared statuses, and transport failures.
---

# Errors

Handle a declared 404, a timeout, or an undeclared status by reading the error-first tuple — not by catching throws. `RequestError` is still a `kind` / `code` union, and it is an `Error` (`instanceof Error` is true). Start with `kind`, then `code`.

## Basic Setup

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({ path: struct.object({ id: struct.number() }) }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ message: struct.string() }),
  },
})

const [error, user, response] = await client.execute(getUser({ path: { id: 7 } }))
if (error?.kind === 'http' && error.status === 404) {
  console.log(error.data.message)
} else if (error?.kind === 'transport' && error.code === 'TIMEOUT') {
  console.log('timed out')
} else if (error?.kind === 'definition' && error.code === 'UNDECLARED_STATUS') {
  console.log('status not in output map', error.response?.status)
} else if (!error) {
  console.log(user.name, response.status)
}
```

```typescript twoslash
import { createTransportError, ERR_ABORTED, type RequestError } from '@defjs/core'

function classify(error: RequestError): string {
  if (error.kind === 'http') return `status:${error.status}`
  if (error.kind === 'transport') return `transport:${error.code}`
  return `definition:${error.code}`
}

const example: RequestError = createTransportError(ERR_ABORTED)
console.log(classify(example))
```

## Stable codes

| `kind`       | Codes                                                                                                | Meaning                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `http`       | `HTTP_STATUS`                                                                                        | Non-2xx reached the HTTP boundary. Keeps `status`, `response`, and any decoded status-specific `data`.                |
| `transport`  | `ABORTED`, `TIMEOUT`, `NETWORK_ERROR`                                                                | Cancel, timeout, or Fetch/transport failure blocked a normal result.                                                  |
| `definition` | `REQUEST_VALIDATION_FAILED`, `RESPONSE_VALIDATION_FAILED`, `UNDECLARED_STATUS`, `INTERCEPTOR_FAILED` | Input, request construction, response representation, Struct decode, status-contract failure, or interceptor `throw`. |

`cause` is optional on transport and definition errors. `response` is always on HTTP status errors; it may appear on definition errors when a response already existed.

## Tuple shapes by transport

```typescript twoslash
import type {
  EventStreamHandle,
  EventStreamOpenInfo,
  HttpResponse,
  RequestError,
  WebSocketConnectionInfo,
  WebSocketSession,
} from '@defjs/core'

type HttpResult =
  | [error: null, data: unknown, response: HttpResponse<unknown>]
  | [error: RequestError, data: undefined, response: HttpResponse<unknown> | undefined]
type SseResult =
  | [error: null, stream: EventStreamHandle<unknown>, open: EventStreamOpenInfo]
  | [error: RequestError, stream: undefined, open: EventStreamOpenInfo | undefined]
type SocketResult =
  | [error: null, session: WebSocketSession<unknown>, connection: WebSocketConnectionInfo]
  | [error: RequestError, session: undefined, connection: WebSocketConnectionInfo | undefined]

const results: [HttpResult, SseResult, SocketResult] | undefined = undefined
void results
```

Startup failure → second item `undefined`. Third item only when that transport produced a response/snapshot first. After an SSE handle or WebSocket session returns, later failures live on that handle’s lifecycle — they don’t rewrite the settled startup tuple.

## HTTP status and data

Exact-status first. With `output`, Defjs selects the matching Struct before Struct-decoding the body, so `error.status` and `error.data` stay correlated. An undeclared status is `UNDECLARED_STATUS` (`kind: 'definition'`) even when Fetch already filled `response.body`.

| Situation                                  | Tuple outcome                              | Body behavior                                                 |
| ------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------- |
| 2xx with matching declared status          | Success                                    | Selected Struct → `data`                                      |
| Non-2xx with matching declared status      | `HTTP_STATUS`                              | Selected Struct → typed `error.data`                          |
| Any status with no matching declaration    | `UNDECLARED_STATUS` (`kind: 'definition'`) | Response may still be present; body is not decoded as success |
| Matching status, body representation fails | `RESPONSE_VALIDATION_FAILED`               | No partial typed value                                        |
| `output` omitted                           | 2xx succeeds; non-2xx → `HTTP_STATUS`      | Body not decoded; `data` is `undefined`                       |
| Response status `0`                        | Transport error                            | `response.error` → `NETWORK_ERROR`, `ABORTED`, or `TIMEOUT`   |

`HttpResponse.ok` means only `200 <= status < 300`. Normal non-2xx does not set `HttpResponse.error` — that property is for Fetch-boundary transport or body-representation failure.

## Startup vs post-open

SSE validates status, `text/event-stream`, and body before resolving the handle. Failed status → `HTTP_STATUS`. Bad content type or missing body → `RESPONSE_VALIDATION_FAILED`. Opening snapshot can still land in the third tuple slot.

WebSocket startup covers handshake + first physical open. Constructor failure, pre-open close, timeout, or cancel → startup tuple. A connection snapshot may exist even if the socket never reaches `open`.

| Transport | After startup                                                                                                                                                  |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SSE       | Iterator rejects on fatal error; `stream.closed` resolves with `code: 'error'` and an `EventStreamErrorCode`                                                   |
| WebSocket | `onRuntimeError` for message/queue/heartbeat/runtime failures; `receive` fails on terminal errors; `session.closed` → `kind: 'error' \| 'aborted' \| 'closed'` |
| HTTP      | Execute promise settles once. Interceptor/callback code can still throw outside tuple normalization                                                            |

`ABORTED` / `TIMEOUT` describe the caller-facing startup result. You still close a returned stream/session and await its terminal promise.

## Native Error logging and cause

`RequestError` variants are native `Error` instances, so no diagnostic adapter is needed. `String(error)` uses the stable native form `<name>: <message>`. `kind`, `code`, and variant fields such as `status`, `response`, and `data` remain enumerable for structured logging; `name` and the native `cause` chain are non-enumerable.

```typescript twoslash
import { StructError, type RequestError } from '@defjs/core'

export function logRequestError(error: RequestError): void {
  console.error(String(error), { code: error.code, kind: error.kind })
  if (error.cause instanceof StructError) {
    console.error(error.cause.prettify())
  }
}
```

Narrow `error.cause instanceof StructError` before calling `format()`, `flatten()`, or `prettify()`. Those helpers stay on the Struct cause; they are not copied onto the outer `DefinitionError`. Don’t make control flow parse `message` or `String(error)` — `kind`, `code`, and reviewed status remain the contract.

## Reference

| Branch                 | Control-flow check                           | Useful stable fields                        | Usually absent / sensitive        |
| ---------------------- | -------------------------------------------- | ------------------------------------------- | --------------------------------- |
| HTTP status policy     | `error.kind === 'http'`                      | `error.status`, reviewed `error.data`       | Body, headers, URL, `cause`       |
| Caller cancellation    | `kind === 'transport' && code === 'ABORTED'` | `kind`, `code`                              | Abort reason and stack            |
| Timeout                | `kind === 'transport' && code === 'TIMEOUT'` | `kind`, `code`                              | Request URL and underlying cause  |
| Contract failure       | `error.kind === 'definition'`                | `kind`, `code`, reviewed `response?.status` | Struct issues, body, input values |
| Stream/session runtime | `stream.closed` / `session.closed`           | Terminal code/kind, reviewed close status   | Event payloads, frames, causes    |

Don’t infer CORS from status `0` — branch on `kind` and `code`.

Treat `cause`, `data`, response headers/bodies, URLs, Struct issues, input values, and stacks as sensitive. A conservative summary:

```typescript twoslash
import type { RequestError } from '@defjs/core'

export function summarize(error: RequestError): { kind: RequestError['kind']; code: RequestError['code']; status?: number } {
  return {
    kind: error.kind,
    code: error.code,
    status: error.kind === 'http' ? error.status : error.kind === 'definition' ? error.response?.status : undefined,
  }
}
```

`createTransportError`, `createDefinitionError`, and `createHttpStatusError` build these native Error values. Normal request failures still return them in the tuple; they are not thrown merely because they now inherit native Error behavior. `ERR_ABORTED` and `ERR_TIMEOUT` are shared causes the transport normalizer recognizes.

## Related recipes

- [GET with a declared 404](../recipes/get-declared-404.md)
- [Cancel an HTTP call](../recipes/cancel-http.md)

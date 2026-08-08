# HTTP Basic Authentication for an SSE Inventory Feed

## Problem

A warehouse inventory worker subscribes to low-stock alerts. Although an SSE connection starts with a Fetch-shaped handshake, Defjs uses an SSE interceptor chain, so stream credentials must be installed with `basicAuthSSEInterceptor`.

The example keeps authentication on a dedicated inventory client, validates the named event payload, and makes the business operation own stream closure.

## Scenario

The worker opens `GET https://inventory.invalid/v1/inventory/alerts` as `inventory-reader`. A finite local SSE fixture checks the Basic header and emits one `inventory-low` event for SKU `PUMP-42`, with two units available. The operation returns that alert and closes the stream in `finally`.

## Approach

Use the SSE-specific Basic interceptor for the stream handshake, consume the one Struct-validated named event, and let the owned stream operation close its handle in `finally`.

## Source map

- [`src/index.ts`](./src/index.ts): Event contract, low-stock operation, authenticated SSE fixture, client configuration, lifecycle cleanup, and output.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-auth-basic-sse start
```

The command performs no external traffic and settles the stream.

## Expected result

```text
{"available":2,"sku":"PUMP-42"}
```

The output contains only the parsed business payload. Basic credentials stay inside the client and fixture.

## Key points

- HTTP and SSE interceptors are transport-specific in Defjs.
- After `switch` selects `inventory-low`, TypeScript exposes its Struct-decoded `available` and `sku` fields directly.
- The operation closes the stream and awaits `stream.closed` even if consumption fails.

## Production notes

Replace `fixtureFetch` with the inventory SSE transport and load credentials from a server-side secret manager. Keep the endpoint on HTTPS, redact handshake headers, define bounded reconnect and queue policies, and close the stream during worker shutdown or cancellation.

## Inspiration

- [RFC 7617, The Basic HTTP Authentication Scheme](https://www.rfc-editor.org/rfc/rfc7617.html#section-2) defines the Basic credential field used by the stream handshake. Defjs applies it with `basicAuthSSEInterceptor`; TLS, secret storage, server challenges, and authorization remain outside the interceptor.
- [HTML Living Standard, Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html#server-sent-events) defines `text/event-stream`, named events, event IDs, and line-based framing. This example adopts those wire rules through `defineEventStream`; browser `EventSource` behavior, automatic reconnect, and a long-lived server are excluded.
- [Defjs Basic interceptor implementation](https://github.com/defjs/defjs/blob/598c218144bc3e5c4844bc8746e08d31010a5309/packages/core/src/interceptor/basic_auth.ts#L32-L40) is the existing authoritative project reference for distinct HTTP and SSE interceptor kinds. The example selects the public SSE variant through `client.execute`; direct interceptor invocation and internal chain construction are deliberately out of scope.

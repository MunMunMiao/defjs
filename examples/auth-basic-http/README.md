# HTTP Basic Authentication for a Warehouse API

## Problem

An overnight warehouse worker loads the morning pick queue before operators arrive. Building `Authorization` at every call site spreads a reusable password through business code and makes request behavior easy to drift.

The example keeps Basic authentication on one Defjs client configured for the warehouse origin. The request contract also keeps a `401` authentication document separate from successful queue data.

## Scenario

The `warehouse-reader` machine requests `GET https://warehouse.invalid/v1/pick-queues/morning`. A local Fetch fixture returns queue data only when it receives the expected Basic credential. The business operation returns three open pick lists for warehouse `sea-1` without exposing the credential.

## Approach

Attach the HTTP Basic interceptor to a client pinned to the warehouse HTTPS origin, execute the typed queue request against a local credential check, and expose only the validated queue data.

## Source map

- [`src/index.ts`](./src/index.ts): Request contract, queue-loading operation, local authenticated fixture, client configuration, and output.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-auth-basic-http start
```

The command performs no external traffic.

## Expected result

```text
{"openPickLists":3,"warehouse":"sea-1"}
```

The successful queue is the only emitted data. The fixture accepts it only after the interceptor supplies the expected credential; neither the password nor the encoded header is printed.

## Key points

- Basic encoding is reversible, so the transport still requires HTTPS.
- Credential injection belongs to the dedicated client rather than individual warehouse calls.
- The request contract prevents a declared `401` body from being treated as queue data.

## Production notes

Replace `fixtureFetch` with the warehouse transport and load the username and password from a server-side secret manager. Keep certificate verification enabled, prevent redirects to untrusted origins, redact `Authorization` from logs and traces, and rotate credentials atomically.

## Inspiration

- [RFC 7617, The Basic HTTP Authentication Scheme](https://www.rfc-editor.org/rfc/rfc7617.html#section-2) defines the `Basic base64(user-id:password)` credential form. This example adopts that form through Defjs `basicAuthHttpInterceptor`; TLS enforcement, secret storage, challenge processing, and post-authentication authorization remain application or server responsibilities.
- [twilio-node's request client](https://github.com/twilio/twilio-node/blob/a3597ec652ac46e42baf0dc66a614dda258fc247/src/base/RequestClient.ts#L162-L206) is the existing official implementation reference for client-owned Basic credentials on outgoing requests. Defjs expresses the injection as an HTTP interceptor on a fixed client; Twilio-specific request options, telemetry, retries, and API behavior are deliberately not reproduced.

# SSE Startup Validation for Order Status

## Problem

A fulfillment worker cannot treat every resolved Fetch response as an opened event stream. A gateway can return `200 application/json`, which is an HTTP success but does not satisfy the SSE media-type contract.

The worker must receive a stream handle only after the response is valid for SSE, then consume payloads through the declared event Struct.

## Scenario

The local fulfillment fixture returns two responses for `GET https://fulfillment.invalid/v1/orders/order-741/status`. The first is a misrouted `200 application/json` response and is rejected with `RESPONSE_VALIDATION_FAILED`. The second is `200 text/event-stream; charset=utf-8` and contains one packed order event for `order-741`.

## Approach

Disable automatic startup retry, execute the same stream command against the wrong and correct media types, and transfer iterator ownership only for the successfully validated SSE response.

## Source map

- [`src/index.ts`](./src/index.ts): Startup contract, packed-order operation, two-response Fetch fixture, and runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-sse-startup-validation start
```

The command is local and offline. Reconnect is disabled so each fixture response is observed once.

## Expected result

```text
{"order":{"orderId":"order-741","state":"packed"},"rejectedStartup":"RESPONSE_VALIDATION_FAILED"}
```

The first field comes from the valid event stream. `rejectedStartup` shows that status `200` alone did not transfer stream ownership.

## Key points

- HTTP success and SSE media-type validity are separate startup conditions.
- Failed startup returns an error tuple and no stream handle to clean up.
- The `order-status` case returns its Struct-derived packed-order payload while the opened branch owns cleanup.

## Production notes

Replace `fixtureFetch` with the fulfillment gateway. Classify retryable startup failures explicitly, bound reconnects and delays, and do not report a worker ready before a valid stream opens.

## Inspiration

- [HTML Living Standard, processing model for server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html#processing-model) requires a successful response with a supported `text/event-stream` type before event parsing.
- [Azure fetch-event-source startup validation](https://github.com/Azure/fetch-event-source/blob/a0529492576e094374602f24d5e64b3a271b4576/README.md#L56-L90) is the retained implementation reference for validating status and content type before consuming events.

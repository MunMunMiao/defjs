# SSE Parser Buffer Limit for Risk Alerts

## Problem

A broken or hostile risk-alert upstream can start an SSE line and never send a line terminator. A parser without a retained-buffer bound can keep accumulating bytes before any complete event reaches payload validation.

This example caps the unfinished parser buffer at 32 bytes and disables reconnect for that deterministic protocol failure.

## Scenario

The local response for `GET https://risk.invalid/v1/payments/risk-alerts` contains one unterminated 38-byte ASCII line: `data: ` followed by 32 `x` characters. Defjs opens the valid SSE response, then its line parser rejects the retained bytes with `SSE parser buffer exceeded maxBufferSize`.

## Approach

Set `maxBufferSize` independently from queue policy, feed one unterminated line beyond that retained-byte limit, and surface the parser failure while the stream helper closes its handle.

## Source map

- [`src/index.ts`](./src/index.ts): Risk-alert stream definition, parser limit, business operation, malformed local fixture, and runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-sse-parser-buffer-limit start
```

The command is local and offline. The acquired stream is closed and awaited after the parser error.

## Expected result

```text
{"error":"SSE parser buffer exceeded maxBufferSize","parserLimitBytes":32}
```

The error occurs before a complete event is dispatched, so there are no payment IDs to report.

## Key points

- `maxBufferSize` bounds retained bytes for an unfinished parser line.
- A decoded `risk-alert` branch exposes its typed payment fields directly; parser bytes and queue capacity remain separate limits.
- Deterministic framing failures should not reconnect indefinitely.

## Production notes

Choose the limit from documented field lengths, encoding, and proxy chunking. Add independent bounds for event payloads, queues, reconnect delay, response duration, and the owner deadline.

## Inspiration

- [HTML Living Standard, event stream interpretation](https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation) defines the line-oriented SSE framing that requires a terminator before dispatch.
- [Apache Pekko SSE EventSource](https://github.com/apache/pekko-connectors/blob/85a64f9d8e03119db4eeb36fc6269815071101bb/sse/src/main/scala/org/apache/pekko/stream/connectors/sse/scaladsl/EventSource.scala#L36-L54) is the retained implementation reference for constraining line-oriented SSE parsing.
- [Defjs SSE buffer contract](https://github.com/defjs/defjs/blob/598c218144bc3e5c4844bc8746e08d31010a5309/packages/core/src/sse/transport/event_stream.ts#L53-L65) is the authoritative project source for `maxBufferSize`.

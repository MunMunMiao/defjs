# Bounded WebSocket Outbox for Pick Confirmations

## Problem

A warehouse scanner can confirm picks while its WebSocket gateway is reconnecting. An unbounded disconnected outbox can exhaust memory, while silent overflow can lose business work.

The scanner needs a two-item FIFO outbox whose third send fails visibly and remains caller-owned.

## Scenario

The initial local socket opens and then closes with `1012`. Its replacement remains in `CONNECTING` while the scanner confirms `pick-101`, `pick-102`, and `pick-103`.

The first two serialized frames fit the Defjs queue. The third call throws `WebSocket send queue overflow`. Opening the replacement flushes only the retained frames in their original order.

## Approach

Set endpoint `maxOutgoingQueueSize` to two, hold the replacement socket in `CONNECTING`, enqueue two confirmations, observe explicit overflow on the third, then close and await the session.

## Source map

- [`src/index.ts`](./src/index.ts): Pick definition, business send, queue configuration, boundary execution, and output.
- [`src/fixture.ts`](./src/fixture.ts): Minimal reconnect barrier and raw send transport.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-websocket-outgoing-queue start
```

Execution is local and offline. The connection barrier makes queueing deterministic without sleeps.

## Expected result

```text
{"flushed":[{"type":"confirm-pick","pickId":"pick-101","sequence":1},{"type":"confirm-pick","pickId":"pick-102","sequence":2}],"overflow":"WebSocket send queue overflow"}
```

The retained confirmations flush in FIFO order, and the rejected third confirmation remains visible to the caller.

## Key points

- The endpoint-owned `maxOutgoingQueueSize` defaults to `0`; positive capacity is available only during `reconnecting`.
- `maxOutgoingQueueSize` bounds queued item count, not bytes or the platform socket's `bufferedAmount`.
- The retained FIFO flushes before replacement `open` observers can send, and the transport never replays frames already sent to an earlier socket.
- FIFO transport flush is not exactly-once delivery; durable work still needs stable IDs and receiver idempotency.

## Production notes

Choose capacity from outage duration, send rate, payload size, and memory limits. Persist confirmations that must survive process loss, bound reconnect attempts and total delay, and expose overflow without logging sensitive payloads.

## Inspiration

- [reconnecting-websocket send queue](https://github.com/pladaria/reconnecting-websocket/blob/05a2f7cb0e31f15dff5ff35ad53d07b1bec5e197/reconnecting-websocket.ts#L249-L263) is the retained implementation reference for queueing before open and flushing in order.
- [WHATWG WebSockets, `send()` and `bufferedAmount`](https://websockets.spec.whatwg.org/#dom-websocket-send) defines native buffering after `send()`; this example adds a bounded pre-open Defjs outbox.

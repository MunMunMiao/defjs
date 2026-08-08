# Bounded SSE Reconnects for Route Status

## Problem

A dispatch console should recover from short-lived route-feed disconnects without retrying forever. The logical subscription needs a finite physical request budget and capped delay growth.

This example allows two reconnects after the initial request, with delays starting at 1 ms and capped at 2 ms.

## Scenario

The local `route-17` feed disconnects on its first two responses. The third physical request, which is the second and final allowed reconnect, emits `route-status` with state `en-route`. One `waitForRouteState` call spans all three requests.

## Approach

Configure two reconnects with bounded delay, keep one logical iterator across physical disconnects, and return the first validated route state from the final allowed request.

## Source map

- [`src/index.ts`](./src/index.ts): Route stream definition, bounded reconnect configuration, business operation, local fixture, and runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-sse-bounded-reconnect start
```

The runner is local and offline. Its deterministic retry delays are 1 ms and 2 ms.

## Expected result

```text
{"requests":3,"state":"en-route"}
```

Three requests mean the initial connection plus the two configured reconnects. The business operation sees only the recovered route state.

## Key points

- `attempts: 2` permits two reconnects after the initial request.
- `factor` grows the base delay, `maxDelayMs` caps that base, and optional jitter is added afterward.
- The `route-status` case receives the matching decoded payload while the iterator remains one logical stream across requests.

## Production notes

Choose delays from service recovery behavior, add jitter and an owner deadline, and reconnect only for eligible causes. Keep parser, queue, replay, and shutdown policies independently bounded.

## Inspiration

- [HTML Living Standard, Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html#server-sent-events) defines reconnection and server-provided retry intervals.
- [LaunchDarkly EventSource retry delay strategy](https://github.com/launchdarkly/okhttp-eventsource/blob/55846b11c3ec501b7a11b9733b96893c7b8de837/src/main/java/com/launchdarkly/eventsource/RetryDelayStrategy.java#L3-L18) is the retained implementation reference for backoff, jitter, and maximum delay.
- [Defjs SSE reconnect contract](https://github.com/defjs/defjs/blob/598c218144bc3e5c4844bc8746e08d31010a5309/packages/core/src/sse/transport/event_stream.ts#L34-L65) is the authoritative project source for the reconnect options configured here.

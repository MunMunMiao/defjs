# Owned SSE Lifecycle for Case Assignments

## Problem

A support workspace must stop its case-assignment subscription when the owning component or worker scope ends. A detached consumer can otherwise retain the request, response reader, callback, and stream handle beyond that scope.

One owner should provide the abort signal, mirror cancellation into the Defjs handle, remove its listener, and await terminal cleanup.

## Scenario

The local support response emits one `case-assigned` event for `case-842` in the `billing` queue and then remains open. The business callback records that assignment and aborts its owner. `consumeCaseAssignments` closes the handle from the signal, removes the listener in `finally`, and waits until `stream.closed` reports `aborted`.

## Approach

Transfer the opened stream to one operation owner, tie its abort signal to `close`, consume the typed assignment, and remove the listener plus await `closed` in the operation's `finally`.

## Source map

- [`src/index.ts`](./src/index.ts): Assignment stream definition, owner-scoped business operation, open-body fixture, and runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-sse-owned-lifecycle start
```

Execution is local and offline. The process exits only after the owner-triggered stream shutdown settles.

## Expected result

```text
{"assignment":{"caseId":"case-842","queue":"billing"},"terminal":"aborted"}
```

The assignment is delivered while the owner is active, and the terminal state records the cancellation that ends the otherwise open response.

## Key points

- The `case-assigned` branch passes its Struct-derived assignment type directly to the owner callback.
- Opened resources are released in `finally`, including listener removal and terminal waiting.
- Calling `close` is idempotent; awaiting `closed` defines when disposal is complete.

## Production notes

Bind the controller to the real component, worker, or application scope. Add bounded reconnect, parser, queue, and deadline policies, and prevent callbacks from mutating disposed application state.

## Inspiration

- [DOM Standard, AbortController](https://dom.spec.whatwg.org/#interface-abortcontroller) defines owner-triggered abort signaling and abort reasons.
- [Resty SSE lifecycle implementation](https://github.com/go-resty/resty/blob/29010be3b22dde872740e1e39e50cf8c0eba189c/sse.go#L448-L570) is the retained implementation reference for tying stream consumption, cancellation, completion, and cleanup together.
- [Defjs event-stream handle contract](https://github.com/defjs/defjs/blob/598c218144bc3e5c4844bc8746e08d31010a5309/packages/core/src/sse/transport/event_stream.ts#L28-L32) is the authoritative project source for `open`, `closed`, `close`, and async iteration.

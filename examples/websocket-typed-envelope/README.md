# Typed WebSocket Envelopes for Support Replies

## Problem

A support agent sends a case reply and waits for the service to record it. Serializing arbitrary objects and casting `JSON.parse` results would let the sender and receiver bypass the application's message contract.

The workflow needs typed `post-reply` and `reply-recorded` envelopes at the WebSocket boundary.

## Scenario

The runner connects to `wss://support.invalid/v1/support/cases/case-842/chat` through a local fixture. It sends agent `agent-7`'s `Package located` reply. The fixture parses that native JSON text frame and returns one acknowledgement with message ID `msg-17`.

`postCaseReply` waits for the typed acknowledgement and closes the session before returning it.

## Approach

Declare outgoing replies plus two incoming message variants, send one reply, and exhaustively switch on the validated incoming union before closing the owned session.

## Source map

- [`src/index.ts`](./src/index.ts): WebSocket definition, support operation, local execution, and output.
- [`src/fixture.ts`](./src/fixture.ts): Minimal text-frame WebSocket used for deterministic local execution.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-websocket-typed-envelope start
```

Execution is local and offline. The operation closes and awaits its fixture socket before exiting.

## Expected result

```text
{"reply":{"type":"reply-recorded","messageId":"msg-17","text":"Package located"},"sent":{"type":"post-reply","agentId":"agent-7","text":"Package located"}}
```

The outgoing value is serialized from the declared `post-reply` Struct, and the acknowledgement reaches business code through the declared `reply-recorded` Struct.

## Key points

- Switching on `message.type` narrows each incoming variant to its matching Struct fields, with a `never` branch enforcing exhaustiveness.
- `session.send` validates and serializes outgoing data synchronously.
- The operation that consumes `session.receive` also closes and awaits the session.

## Production notes

Replace the fixture with the support gateway, authenticate only for the expected secure origin and case path, and keep customer text out of diagnostics. Add bounded queues, reconnect policy, deadlines, and durable message identity according to the service's delivery guarantees.

## Inspiration

- [graphql-ws message parsing and validation](https://github.com/enisdenjo/graphql-ws/blob/af4f5c9df60d6b73667d7d90ad1b1c851d22b482/src/common.ts#L199-L238) is the retained implementation reference for parsing discriminated WebSocket messages and rejecting invalid shapes.
- [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259) defines JSON syntax; Defjs Structs add the application-level payload contract used here.

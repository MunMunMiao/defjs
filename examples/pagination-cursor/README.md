# Cursor Pagination for Support Messages

## Problem

A support archive worker must read every message in a closed conversation. The provider returns an opaque `nextCursor`; treating it as a page number or stopping after the first response loses messages.

The application owns iteration with a 20-page cap and rejects a repeated non-empty cursor before another dispatch; Defjs validates every page before its items or cursor are used.

## Scenario

The local support API serves `GET /support/conversations/conversation-482/messages`. The first page contains `message-101` and `message-102` with cursor `after-message-102`. The second request sends that cursor and receives `message-103` without a continuation.

The injected Fetch implementation keeps execution deterministic and offline.

## Approach

Validate each page with its opaque continuation cursor, append message IDs in order, and stop on completion under the exported hard page cap and no-progress policy.

## Source map

- [`src/index.ts`](./src/index.ts): Request definition, exported cursor operation, two-page Fetch fixture, and runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-pagination-cursor start
```

## Expected result

```text
{"messageIds":["message-101","message-102","message-103"]}
```

The order shows that both validated pages were consumed. The cursor itself remains transport metadata and is not emitted.

## Key points

- Continuation cursors are opaque values supplied by the service.
- Each follow-up is rebuilt from the original Defjs request definition.
- Empty continuation ends the loop; repeated cursors and the page cap fail before another request.

## Production notes

Tune the page cap to the provider and add caller cancellation, retry policy, and durable checkpoints around the same iteration boundary.

## Inspiration

- [Slack Web API pagination](https://api.slack.com/docs/pagination) documents opaque cursor reuse and termination when `response_metadata.next_cursor` is empty.
- [Slack Node SDK `paginate`](https://github.com/slackapi/node-slack-sdk/blob/99a83cf11852f90ae9931de818185b5af4e54d00/packages/web-api/src/WebClient.ts#L366-L383) demonstrates owning cursor iteration above individual requests.

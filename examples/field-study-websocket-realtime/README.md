# WebSocket Realtime Field Study

This private workspace package runs the same deterministic status-subscription fixture through two client lanes:

- **Defjs** uses the workspace `@defjs/core` WebSocket client with Struct-validated envelopes, one reviewed reconnect, generation-driven active-watch restoration, one non-replayed mutation, and owned session shutdown.
- **graphql-ws** uses `graphql-ws@6.2.1` with `graphql-transport-ws`, one retry, active-subscription replay, `iterator.return()`, and `client.dispose()`.

Both lanes use one in-process fake WebSocket implementation. Each scenario creates two fixture socket instances: the first closes with code `1012`, then the replacement receives the replay. This is client/protocol integration acceptance, not browser, native-WebSocket, network-server, proxy, or production-timing E2E coverage.

## Run

```bash
pnpm --filter @defjs/field-study-websocket-realtime build
pnpm --filter @defjs/field-study-websocket-realtime test
pnpm --filter @defjs/field-study-websocket-realtime start
```

## Acceptance

- Defjs and graphql-ws each run success and invalid scenarios: 4/4 declared scenarios.
- Every scenario observes close code `1012`, one reconnect/replay, and a final client close with code `1000` after awaited cleanup.
- Defjs sends its `record-view` mutation exactly once across both physical connections, and uses `session.connection.generation` to restore only the still-active status subscription.
- Defjs rejects string `progress` with a `StructError` at `progress` and never enqueues the invalid event.
- graphql-ws requests `graphql-transport-ws`, replays the exact `JobStatus` operation and variables with the same subscription ID, and sends `complete` for that ID.
- A graphql-ws result generic does not add runtime application-field validation, so its invalid scenario delivers `progress: "100"`; cleanup sends `complete` and waits for terminal close.

## Expected result

`start` prints one JSON line. Formatted for readability, its value is:

```json
{
  "defjs": {
    "invalid": {
      "attempts": 2,
      "closeCodes": [1012, 1000],
      "cleanup": { "action": "session.close", "closeAwaited": true, "protocolCompleteSent": false },
      "invalid": { "accepted": false, "value": null },
      "replayCount": 1,
      "result": null,
      "runtimeError": { "firstIssuePath": ["progress"], "name": "StructError" }
    },
    "success": {
      "attempts": 2,
      "closeCodes": [1012, 1000],
      "cleanup": { "action": "session.close", "closeAwaited": true, "protocolCompleteSent": false },
      "invalid": null,
      "replayCount": 1,
      "result": { "type": "status-update", "jobId": "job-42", "progress": 100, "state": "complete" },
      "runtimeError": null
    }
  },
  "graphqlWs": {
    "invalid": {
      "attempts": 2,
      "closeCodes": [1012, 1000],
      "cleanup": { "action": "iterator.return", "closeAwaited": true, "protocolCompleteSent": true },
      "invalid": { "accepted": true, "value": { "jobId": "job-42", "progress": "100", "state": "complete" } },
      "replayCount": 1,
      "result": null,
      "runtimeError": null
    },
    "success": {
      "attempts": 2,
      "closeCodes": [1012, 1000],
      "cleanup": { "action": "iterator.return", "closeAwaited": true, "protocolCompleteSent": true },
      "invalid": null,
      "replayCount": 1,
      "result": { "jobId": "job-42", "progress": 100, "state": "complete" },
      "runtimeError": null
    }
  }
}
```

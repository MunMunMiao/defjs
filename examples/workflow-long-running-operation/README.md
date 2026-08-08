# Polling a Long-Running Report Export

## Problem

An analytics worker starts a CSV export that completes asynchronously. The initial `202` response identifies an operation resource, so treating it as the report result or polling without a limit gives the workflow incorrect ownership.

The application must validate the operation ID, compose caller cancellation with one total deadline, cap polls, and accept a completion URL only from the configured HTTPS download origin.

## Scenario

The local API accepts `POST /reports/sales-2025-03/exports` and returns operation `export-901`. The first `GET /report-exports/export-901` response is `pending`; the second is `completed` with `https://downloads.invalid/sales-2025-03.csv`.

A one-millisecond abort-aware interval keeps the offline demonstration quick. Start, every poll, and each delay share a one-second total deadline; the workflow permits at most three polls.

## Approach

Start the export and poll its same-origin operation under one deadline and poll cap, using an abort-aware deterministic interval until the typed completed state supplies a trusted download URL.

## Source map

- [`src/index.ts`](./src/index.ts): Start and poll definitions, exported workflow, local state fixture, and runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-workflow-long-running-operation start
```

## Expected result

```text
{"downloadUrl":"https://downloads.invalid/sales-2025-03.csv"}
```

The result is returned only after Defjs validates the completed poll body and confirms the configured HTTPS download origin.

## Key points

- The creation response and operation resource are separate typed requests.
- Poll count and the total deadline bound different failure modes.
- Provider-controlled completion URLs are parsed and checked before use.

## Production notes

Choose the total deadline from the remaining job budget, retain caller cancellation, and persist operation IDs when exports must survive process restarts.

## Inspiration

- [Google AIP-151, Long-running operations](https://google.aip.dev/151) defines an operation resource that is polled until `done` and can contain either a response or error.
- [gax-nodejs long-running call polling](https://github.com/googleapis/gax-nodejs/blob/78d9c75a4fca10f8f35b327a0b013bc9ad44fad3/gax/src/longRunningCalls/longrunning.ts#L255-L341) demonstrates an explicit polling lifecycle in an official client.

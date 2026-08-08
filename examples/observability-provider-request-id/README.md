# Provider Request IDs for Invoice Export Diagnostics

## Problem

A billing worker submits invoice exports to an external provider. Support needs the provider's request ID whether an export is accepted or rejected, but a success-only implementation loses the header attached to HTTP errors.

Defjs exposes success response headers on the response tuple and typed HTTP-error headers on `error.response`. The business operation must read the appropriate side before returning its result.

## Scenario

The worker submits period `2025-02` for two customers. `customer-acme` receives `202`, export `export-1042`, and request ID `req-accepted-1042`. `customer-closed` receives typed `409 { "code": "account_closed" }` and request ID `req-rejected-204`.

A local Fetch fixture provides only those two responses, so the runner is deterministic and offline.

## Approach

Read the bounded provider request ID from the native response before branching on typed `202` and `409` outcomes, preserving diagnostics without mixing them into either body Struct.

## Source map

- [`src/index.ts`](./src/index.ts): The request definition, request-ID extraction, business operation, two-response fixture, and runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-observability-provider-request-id start
```

## Expected result

```text
{"accepted":{"exportId":"export-1042","ok":true,"providerRequestId":"req-accepted-1042"},"rejected":{"ok":false,"providerRequestId":"req-rejected-204","status":409}}
```

`accepted` preserves the export ID and success response request ID. `rejected` preserves the typed HTTP status and the request ID read from `error.response.headers`.

## Key points

- Provider diagnostics can be present on both successful and failed HTTP responses.
- Branch on the Defjs error tuple before reading success data.
- A provider request ID is diagnostic metadata, not proof that an export succeeded.
- Validate and bound provider metadata before writing it to production logs or support systems.

## Production notes

Use the exact header documented by the provider and apply its format constraints. Protect request IDs in support tooling, and associate them with a bounded operation name and timestamp without copying credentials or invoice contents. Add idempotency policy before retrying export submissions.

## Inspiration

- [OpenAI Node success-path request ID handling](https://github.com/openai/openai-node/blob/228c224393ef4bf3bda2a9d7eb40f387499299b5/src/core/api-promise.ts#L59-L74) is the retained official implementation reference for exposing a response request ID with successful data. Defjs adapts it by returning a small application diagnostic object; OpenAI response wrappers, retries, and API resources are excluded.
- [OpenAI Node error request ID handling](https://github.com/openai/openai-node/blob/228c224393ef4bf3bda2a9d7eb40f387499299b5/src/core/error.ts#L24-L31) is the retained official source for preserving request IDs on API errors. Defjs reads the header from the typed HTTP error response; OpenAI error classes, status taxonomy, and provider support workflow are not reproduced.

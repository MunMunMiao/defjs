# HTTP 204 No Content for Export-Job Deletion

## Problem

An operations console deletes export jobs after reports are downloaded. The service returns `200` with a deletion receipt for an active job and `204 No Content` when retention already removed the job. A client that always decodes successful responses as JSON turns the valid bodyless response into an error.

The business operation accepts both declared outcomes while preserving their different body contracts: `200` carries `{ deleted: boolean }`, and `204` carries `null`.

## Scenario

The local fixture returns `200` with `{ "deleted": true }` for `export-1042` and a native bodyless `204` for `export-expired`. The runner executes both through the same exported deletion operation without external traffic.

## Approach

Declare represented `200` and bodyless `204` as separate response branches, then normalize both successful deletion outcomes without attempting to parse content from `204`.

## Source map

- [`src/index.ts`](./src/index.ts): Request definition, exported deletion operation, two-response fixture, and runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-http-no-content start
```

## Expected result

```text
{"removed":{"deleted":true,"source":"representation"},"alreadyGone":{"deleted":true,"source":"no-content"}}
```

The first result comes from the validated `200` receipt. The second comes from the explicit `204`/`struct.null()` contract, with no invented body.

## Key points

- `204` is a successful HTTP outcome with no response content.
- `struct.null()` gives the bodyless status an explicit Defjs contract.
- The business operation can normalize the outcomes while retaining their source.

## Production notes

Confirm that the provider uses `204` to mean the job is already absent. An asynchronous `202` workflow needs a separate contract and polling policy.

## Inspiration

- [RFC 9110, 204 No Content](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.3.5) states that a `204` response has no content.
- [Immich generated queue API](https://github.com/immich-app/immich/blob/409734e1db36e8df09591b1867104ed7cf3a304c/mobile/openapi/lib/api/queues_api.dart#L184-L199) shows a generated client handling a bodyless successful queue operation.

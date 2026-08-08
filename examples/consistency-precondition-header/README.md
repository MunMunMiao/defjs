# HTTP If-Match Preconditions for Case Notes

## Problem

Two support agents edit `case-204` from note ETag `"note-v4"`. After one agent saves a corrected gate code, an unconditional second `PUT` could silently overwrite it with stale text.

Each replacement must carry the strong, opaque validator in `If-Match`, and `412 Precondition Failed` must become a refetch decision instead of an automatic replay.

## Scenario

The fixture starts at `"note-v4"`. The first request sends that tag, stores `Gate code is 7391`, and returns `"note-v5"`. The second request still sends `"note-v4"`, receives typed `412`, and leaves the accepted text unchanged.

## Approach

Send the opaque current validator in `If-Match`, advance state only for the declared `200` outcome, and map the declared runtime `412` outcome to a refetch-required result.

## Source map

- [`src/index.ts`](./src/index.ts): Conditional request, case-note operation, stateful local fixture, and runner.

## Run

From the repository root:

```sh
pnpm --silent --filter @defjs/example-consistency-precondition-header start
```

## Expected result

```text
{"saved":{"etag":"\"note-v5\""},"stale":"refetch-required","persistedText":"Gate code is 7391"}
```

The accepted write advances the validator to `"note-v5"`; the stale result requests a refetch, and the persisted text remains the first edit.

## Key points

- `If-Match` uses strong comparison for a state-changing request.
- `412` is application control flow, not permission to replay stale input.
- The server must evaluate the precondition and persist the update atomically.

## Production notes

Obtain the ETag from the exact note representation and preserve it unchanged. After `refetch-required`, refetch and apply an explicit merge policy. Authorize, compare, update, and generate the next validator in one concurrency boundary.

## Inspiration

- [RFC 9110 section 13.1.1, If-Match](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.1) defines strong validator comparison, and [section 15.5.13](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.13) defines `412`.
- [Zotero Android update request](https://github.com/zotero/zotero-android/blob/0c3bf9198b2c72d491f6b1ee167acdbd1b45c16f/app/src/main/java/org/zotero/android/sync/syncactions/SubmitUpdateSyncAction.kt#L83-L103) and [its conflict mapping](https://github.com/zotero/zotero-android/blob/0c3bf9198b2c72d491f6b1ee167acdbd1b45c16f/app/src/main/java/org/zotero/android/sync/syncactions/SubmitUpdateSyncAction.kt#L375-L393) are the retained application references for carrying an opaque version and mapping stale responses to control flow.

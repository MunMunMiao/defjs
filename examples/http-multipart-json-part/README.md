# HTTP Multipart JSON Metadata with an Optional File

## Problem

A support gateway expects note metadata as JSON text in a `payload_json` multipart part and accepts an optional `file` part. Passing an object directly would serialize as `[object Object]`, while appending an absent attachment would change omission into an unwanted part.

## Scenario

The runner posts `case-483` without an attachment. The fixture parses the request with `Request.formData()`, decodes `payload_json` with `JSON.parse`, observes that no `file` part exists, and returns `note-483`.

## Approach

Serialize note metadata once into the `payload_json` text part, omit the optional file when absent, and let native `FormData` own the multipart wire details.

## Source map

- [`src/index.ts`](./src/index.ts): Request definition, exported note operation, multipart fixture, and attachment-free runner.

## Run

```sh
pnpm --silent --filter @defjs/example-http-multipart-json-part start
```

Execution is deterministic, local, and exits after one fixture request.

## Expected result

```text
{"noteId":"note-483","metadata":{"case_id":"case-483","content":"No attachment required"},"fileName":null}
```

`fileName: null` shows that the optional file part was omitted while `payload_json` remained valid JSON text.

## Inspiration

- [Discord API: Uploading Files](https://discord.com/developers/docs/reference#uploading-files) documents the `payload_json` convention and binary multipart parts.
- [RFC 7578 section 4.3](https://www.rfc-editor.org/rfc/rfc7578.html#section-4.3) defines how files relate to multipart field names.
- [discord-haskell message multipart implementation](https://github.com/discord-haskell/discord-haskell/blob/79d4650e0b52edac444a56c786bb56dfd7116da2/src/Discord/Internal/Rest/Channel.hs#L509-L535) shows explicit payload serialization alongside uploads.

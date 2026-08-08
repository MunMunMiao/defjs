# Bounded Buffered Carrier Template Downloads

## Problem

A shipping workstation downloads carrier label templates into an `ArrayBuffer` before printing. Checking only `Content-Length`, or checking only after buffering finishes, can let an oversized package consume more memory than the workstation permits.

The operation enforces a 65,536-byte ceiling against Defjs download progress, aborts as soon as cumulative bytes cross it, and checks the completed buffer again before returning it.

## Scenario

The local fixture serves one oversized template in 65,536-byte and 1-byte chunks. Progress reaches 65,537 bytes, causing the operation to abort its stream and return a `RangeError` message.

## Approach

Observe buffered download progress, abort as soon as the caller-owned byte ceiling is crossed, and rely on the local chunked fixture to settle its stream on cancellation.

## Source map

- [`src/index.ts`](./src/index.ts): Binary request definition, buffered download policy, one execution, and output.
- [`src/fixture.ts`](./src/fixture.ts): Minimal abort-aware `ReadableStream` fixture for the oversized response.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-download-buffered-progress start
```

Execution is local and offline. It opens no listener, settles the byte stream, removes its abort listener, and prints one JSON object.

## Expected result

```text
{"loadedBytes":65537,"error":"carrier template exceeds 65536 bytes"}
```

`loadedBytes` crosses the configured ceiling by one byte and produces the reported business error.

## Key points

- `Content-Length` is metadata; enforce the limit against bytes actually read.
- Defjs download progress for `arraybuffer` responses still buffers data in memory.
- The comparison is `>` so exactly 65,536 bytes remains within policy.

## Production notes

Set the ceiling from workstation memory and carrier package limits. For larger artifacts, use a transport that streams to bounded temporary storage instead of buffering an `ArrayBuffer`, then validate integrity before printing.

## Inspiration

- [Rattler download reporter](https://github.com/conda/rattler/blob/e4ed482797defe592a27037565a205e4e52fd4a8/crates/rattler_repodata_gateway/src/reporter.rs#L153-L180) is the retained official source for reporting bytes downloaded against an optional total. Defjs supplies equivalent buffered observations through `onDownloadProgress`; Conda cache layout, download middleware, and archive processing are not reproduced.
- [Fetch Standard, body consumption](https://fetch.spec.whatwg.org/#concept-body-consume-body) defines consuming response bodies as bytes and propagating failures. This example applies an application memory ceiling during Defjs consumption; streaming persistence and integrity validation remain application-owned.

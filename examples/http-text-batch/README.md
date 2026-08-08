# Bounded HTTP Text Batches for Metrics

## Problem

A telemetry collector sends newline-delimited metrics as plain text. The application must prevent one item from injecting extra records and must bound both record count and encoded UTF-8 bytes before dispatch.

## Scenario

The runner posts two checkout metrics to `POST /metrics/write`. `writeMetricBatch` joins them with one newline after enforcing a 500-line and 4,096-byte budget, while the local fixture reads the body through `Request.text()` and returns `204`.

## Approach

Validate line count and UTF-8 byte size before joining metrics with a single newline, send the result as plain text, and deliberately ignore the bodyless successful response.

## Source map

- [`src/index.ts`](./src/index.ts): Text request definition, exported bounded write operation, local fixture, and runnable demonstration.

## Run

```sh
pnpm --silent --filter @defjs/example-http-text-batch start
```

Execution is deterministic, local, and exits after one fixture request.

## Expected result

```text
{"contentType":"text/plain;charset=UTF-8","body":"cpu,host=checkout-1 usage=0.42\nmemory,host=checkout-1 used_bytes=734003200i","batch":{"lines":2,"bytes":75}}
```

The output shows the exact two-record body and the UTF-8 size calculated by the exported operation.

## Inspiration

- [InfluxDB line protocol reference](https://docs.influxdata.com/influxdb/v2/reference/syntax/line-protocol/) documents one point per line and newline-separated batches.
- [InfluxDB Go blocking write implementation](https://github.com/influxdata/influxdb-client-go/blob/3ae8aad218fa56e57c57f4050f3c8b6b01266932/api/writeAPIBlocking.go#L99-L120) shows line strings collected into write requests with surfaced errors.

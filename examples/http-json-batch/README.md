# Correlating Reordered HTTP JSON Batch Responses

## Problem

An order dashboard reads invoice and shipment state in one JSON batch. A provider may reorder child responses, so associating `responses[index]` with `requests[index]` can silently attach shipment state to an invoice.

## Scenario

The runner sends `invoice` and `shipment` child reads for `order-2048` to `POST /batch`. The local fixture deliberately returns `shipment` before `invoice`; `executeOrderReads` indexes responses by child ID and restores the caller's `invoice,shipment` order.

## Approach

Build bounded relative child requests with unique IDs, decode each child as a status-discriminated Struct union, and restore caller order by ID instead of response-array position.

## Source map

- [`src/index.ts`](./src/index.ts): Batch request definition, exported correlation operation, reversing fixture, and runnable demonstration.

## Run

```sh
pnpm --silent --filter @defjs/example-http-json-batch start
```

Execution is deterministic, local, and exits after one fixture request.

## Expected result

```text
[{"id":"invoice","state":"issued"},{"id":"shipment","state":"packed"}]
```

The results retain the requested invoice-then-shipment order even though the fixture returned the child responses in reverse.

## Inspiration

- [Microsoft Graph JSON batching](https://learn.microsoft.com/en-us/graph/json-batching) states that responses can arrive in a different order and must be matched by child `id`.
- [Microsoft Graph JavaScript SDK BatchResponseContent](https://github.com/microsoftgraph/msgraph-sdk-javascript/blob/5438ae90f50ef15d3656f0cf9c5485deee351f19/src/content/BatchResponseContent.ts#L20-L102) indexes child responses by ID.

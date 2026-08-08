# Named SSE Events for Catalog Changes

## Problem

A storefront projection receives both price changes and product retirements from one SSE endpoint. Branching on raw `event` strings and parsing arbitrary JSON in the consumer would leave each business path responsible for its own wire validation.

The projection needs one declared schema per event name and a small business union containing only validated catalog changes.

## Scenario

The storefront opens `GET https://catalog.invalid/v1/catalog/changes`. A finite local response emits a `price-updated` event for `TEA-42` at 1299 cents and a `product-retired` event for `MUG-7`. Defjs selects the matching Struct for each event name before `projectCatalogChanges` maps it into the storefront's `CatalogChange` union.

## Approach

Declare a Struct per supported SSE event name, exhaustively switch on the decoded event union, and project each narrowed payload into the storefront union.

## Source map

- [`src/index.ts`](./src/index.ts): Event definition, catalog projection operation, local Fetch fixture, and runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-sse-named-events start
```

Execution is local and offline. The finite stream is closed and awaited before the process exits.

## Expected result

```text
{"changes":[{"kind":"price-updated","priceCents":1299,"sku":"TEA-42"},{"kind":"product-retired","sku":"MUG-7"}]}
```

The two output variants come from one iterator, but each retains the fields of its declared event schema.

## Key points

- The SSE event name selects the Struct used to decode its `data` field.
- Each `switch` case narrows `event.data` to that event's Struct output; the `never` branch makes newly added events a compile-time obligation.
- Named events let one endpoint expose a precise business union without parsing raw JSON in callbacks.

## Production notes

Replace `fixtureFetch` with an authenticated catalog transport. Add reconnect, parser-buffer, queue, replay, and persistence policies appropriate to the projection, and keep catalog writes idempotent.

## Inspiration

- [HTML Living Standard, Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html#server-sent-events) defines the `event`, `data`, and `id` fields and named-event dispatch. Defjs expresses those rules through `defineEventStream` and Struct decoding.
- [LaunchDarkly streaming processor](https://github.com/launchdarkly/js-core/blob/d29c00dbfa89f2569b8cb819960f2cc7d45cbc18/packages/shared/sdk-server/src/data_sources/StreamingProcessor.ts#L138-L160) is the retained implementation reference for routing named changes into event-specific handling.

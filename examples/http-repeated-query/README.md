# Repeated HTTP Query Keys for Support-Ticket Labels

## Problem

A support dispatcher filters tickets by the `urgent` and `awaiting customer` labels. The ticket API uses an exploded array query, so each value needs its own `label` key. Sending one comma-joined value changes the server-visible filter.

## Scenario

The runner searches `GET /support/tickets` with two labels. Defjs emits `?label=urgent&label=awaiting+customer`, and the local fixture reads both values with native `URLSearchParams.getAll('label')` before returning two ticket IDs.

## Approach

Model labels as an array in the request Struct and let Defjs emit one query key per value; the fixture verifies the native URL with `URLSearchParams.getAll`.

## Source map

- [`src/index.ts`](./src/index.ts): Request definition, exported search operation, URL-parsing fixture, and runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-http-repeated-query start
```

## Expected result

```text
{"query":"?label=urgent&label=awaiting+customer","labels":["urgent","awaiting customer"],"tickets":[{"id":"ticket-482"},{"id":"ticket-731"}]}
```

`query` shows the repeated wire representation, while `labels` shows the server-side values in input order.

## Key points

- Repeated keys and CSV are distinct wire contracts.
- `URLSearchParams.getAll` preserves duplicate-key values and their order.
- Defjs's default array query serialization supplies the exploded representation used here.

## Production notes

Use this convention only when the API specifies repeated query keys, and apply provider-specific limits before accepting untrusted filter arrays.

## Inspiration

- [OpenAPI 3.1 Parameter Serialization](https://spec.openapis.org/oas/v3.1.1.html#style-values) defines `form` query arrays with `explode: true` as repeated parameter names.
- [openapi-fetch query serialization](https://github.com/openapi-ts/openapi-typescript/blob/0cc7ee77d28359c7901d9cd3b5733b70a050ea49/docs/openapi-fetch/api.md#L83-L121) documents configurable array serialization outcomes.

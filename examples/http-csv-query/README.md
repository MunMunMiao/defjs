# CSV HTTP Query Arrays for Knowledge Search

## Problem

An internal knowledge API follows OpenAPI `style: form, explode: false` for its `tag` array. It expects one comma-separated query member. A literal comma inside `priority,high` must remain data rather than becoming another delimiter.

The required order is precise: percent-encode each element, then join elements with unescaped commas.

## Scenario

The runner searches for `type safety` and `priority,high`. The wire query is `?tag=type%20safety,priority%2Chigh`: one comma separates values and the comma inside the second value is encoded. The local fixture splits the raw delimiter before decoding the two tags.

## Approach

Install a client-wide query serializer that encodes each tag independently and joins the encoded values with a literal comma, then inspect and decode that exact wire query in the local fixture.

## Source map

- [`src/index.ts`](./src/index.ts): Request definition, exported search operation, CSV serializer, raw-query fixture, and runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-http-csv-query start
```

## Expected result

```text
{"query":"?tag=type%20safety,priority%2Chigh","tags":["type safety","priority,high"],"articles":[{"id":"kb-17"},{"id":"kb-29"}]}
```

The query and decoded tags demonstrate the distinction between delimiter commas and commas that belong to data.

## Key points

- CSV delimiters are syntax; commas inside values are data.
- A server must split the raw encoded value before percent-decoding each element.
- `withQueryParamsSerializer` configures the convention for the whole client.

## Production notes

Dedicate this client to endpoints that use the same CSV convention. APIs with mixed per-parameter styles need a fuller OpenAPI-aware serializer.

## Inspiration

- [OpenAPI 3.1 Parameter Serialization](https://spec.openapis.org/oas/v3.1.1.html#style-values) defines `form` query arrays with `explode: false` as comma-separated values.
- [OpenAPI Generator CSV query test](https://github.com/OpenAPITools/openapi-generator/blob/9cfe350bee6b5944dfad184c6f489d19727038ba/samples/client/petstore/cpp-boost-beast/tests/api/pet_api_test.cpp#L177-L187) exercises comma-separated array parameters in a generated client.

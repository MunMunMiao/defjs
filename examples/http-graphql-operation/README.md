# GraphQL Operation Errors Inside HTTP 200

## Problem

A dashboard loads its authenticated viewer through GraphQL. HTTP `200` does not guarantee operation success because the response envelope can contain `errors` instead of usable `data`.

## Scenario

The runner sends the fixed `Viewer` operation twice to `POST /graphql`. The local fixture returns viewer `viewer-1042` in the first HTTP `200` response and `errors: [{ message: "viewer temporarily unavailable" }]` in the second HTTP `200`; `loadViewer` returns the first result and surfaces the second message.

## Approach

Send one fixed GraphQL document through a typed HTTP request, decode the GraphQL envelope, and reject its `errors` member before returning any operation data even when HTTP status is `200`.

## Source map

- [`src/index.ts`](./src/index.ts): GraphQL request definition, exported viewer operation, two-response fixture, and runnable contrast.

## Run

```sh
pnpm --silent --filter @defjs/example-http-graphql-operation start
```

Execution is deterministic, local, and exits after two HTTP `200` fixture responses.

## Expected result

```text
{"viewer":{"id":"viewer-1042","login":"mina"},"graphqlError":"viewer temporarily unavailable"}
```

The two output fields show that a typed data result and a GraphQL operation failure require separate handling even when their HTTP status is identical.

## Inspiration

- [GraphQL specification response format](https://spec.graphql.org/October2021/#sec-Response-Format) defines `data`, `errors`, and their coexistence.
- [GraphQL over HTTP status codes](https://graphql.github.io/graphql-over-http/draft/#sec-Status-Codes) explains why a well-formed GraphQL response may use HTTP `200` when an operation produced errors.
- [Octocrab GraphQL execution](https://github.com/XAMPPRocky/octocrab/blob/e6f4fc128e001866df4c0d73d9745eda7e75639f/src/lib.rs#L1444-L1495) provides a GraphQL wrapper that separates response and error handling.

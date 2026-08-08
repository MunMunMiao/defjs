# Struct Zero Values for an Unopened Store Day

## Problem

A retail dashboard requests a daily summary before a store has accepted its first order. The summary service represents that unopened day with a sparse `{}` response. Casting the body leaves fields `undefined`, while truthy fallbacks also replace valid `0`, `false`, and empty-string values.

For this endpoint, omitted summary fields deliberately mean their Defjs zero values. An optional promotion code remains absent, while nullable explanations decode to `null`.

## Scenario

The runner requests `GET /stores/store-1042/daily-summaries/2026-06-01`. A local Fetch fixture returns HTTP `200` with `{}`. Defjs decodes the response into zero orders, `false` order acceptance, an empty adjustment list and operator message, and `null` explanations without adding `promotionCode`.

## Approach

Declare defaults, optional, nullable, and nullish fields explicitly in the response Struct, then decode the sparse `{}` body once to demonstrate each resulting value.

## Source map

- [`src/index.ts`](./src/index.ts): The request contract, exported summary operation, local fixture, and runner.

## Run

From the repository root, after installing the pnpm workspace dependencies:

```sh
pnpm --silent --filter @defjs/example-struct-zero-values start
```

Execution is local and offline through the injected Fetch function.

## Expected result

```text
{"orders":0,"acceptingOrders":false,"adjustmentIds":[],"operatorMessage":"","managerNote":null,"suspensionReason":null}
```

The required fields receive their number, boolean, array, and string zero values. `promotionCode` is absent because it is optional; the nullable and nullish fields are present as `null`.

## Key points

- Zero-value decoding is an endpoint contract, not a substitute for business-required fields.
- Optional omission remains observably different from nullable and nullish output.
- If omission means "unknown," model that state as optional or nullable instead of a business zero.

## Production notes

Use this contract only after agreeing on sparse-response semantics with the producing service. Add application-level range checks for counts and money where needed.

## Inspiration

- [Defjs zero-value tests](https://github.com/defjs/defjs/blob/598c218144bc3e5c4844bc8746e08d31010a5309/packages/core/src/struct/parse.spec.ts#L35-L74) define the library behavior used by this response Struct.
- [Go `encoding/json.Unmarshal`](https://pkg.go.dev/encoding/json#Unmarshal) documents the zero-initialized decoding model that informs this behavior.

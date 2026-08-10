# Explicit Struct Values for an Unopened Store Day

## Problem

A retail dashboard requests a daily summary before a store has accepted its first order. The response must distinguish valid `0`, `false`, `[]`, `''`, and `null` values from omitted optional fields.

Required fields are sent explicitly. An optional promotion code and a nullish suspension reason remain absent, while the required nullable manager note is sent as `null`.

## Scenario

The runner requests `GET /stores/store-1042/daily-summaries/2026-06-01`. A local Fetch fixture returns HTTP `200` with every required field present. Defjs preserves zero orders, `false` order acceptance, an empty adjustment list and operator message, and a `null` manager note without adding the optional or nullish fields.

## Approach

Declare required, optional, nullable, and nullish fields in the response Struct, then decode an explicit body once to demonstrate each resulting value.

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
{"orders":0,"acceptingOrders":false,"adjustmentIds":[],"operatorMessage":"","managerNote":null}
```

The required number, boolean, array, and string values are preserved exactly. `managerNote` is explicitly `null`; `promotionCode` and `suspensionReason` are absent because they are optional and nullish.

## Key points

- Missing required fields fail response validation instead of producing defaults.
- Optional and nullish omission remains observably different from an explicit nullable `null`.
- Valid `0`, `false`, `[]`, and `''` values do not need fallback logic.

## Production notes

Agree on required and optional fields with the producing service. Add application-level range checks for counts and money where needed.

## Inspiration

- [Defjs Struct parser tests](https://github.com/defjs/defjs/blob/main/packages/core/src/struct/parse.spec.ts) define the strict decoding behavior used by this response Struct.
- [Go `encoding/json.Unmarshal`](https://pkg.go.dev/encoding/json#Unmarshal) documents the separate Go model; this example supplies every required value instead of relying on a zero-initialized destination.

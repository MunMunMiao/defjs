# Discriminated Union for Fulfillment Events

## Problem

A fulfillment feed receives packed-parcel and delivery-delay events from a courier. Treating both payloads as one object with optional fields allows business code to read `parcels` from a delay or `reason` from a packed event.

The response contract must select a payload shape from its `type` before the application summarizes it.

## Scenario

The local fixture serves two `GET /fulfillment-events/:eventId` responses for `order-8041`. `evt-packed` contains `type: "parcel_packed"` and a parcel count; `evt-delayed` contains `type: "delivery_delayed"` and a reason. The same exported operation produces the appropriate summary for each validated branch.

## Approach

Declare each fulfillment variant under a literal discriminator, let Struct select the branch after HTTP decoding, and summarize only fields valid for that selected variant.

## Source map

- [`src/index.ts`](./src/index.ts): The response union, exported summary operation, two-response fixture, and runner.

## Run

From the repository root, after installing the pnpm workspace dependencies:

```sh
pnpm --silent --filter @defjs/example-struct-discriminated-union start
```

Both requests use the injected local Fetch function; no external traffic is made.

## Expected result

```text
["2 parcels packed for order-8041","order-8041 delayed: severe weather"]
```

Each string uses a field available only on the Struct branch selected by `type`.

## Key points

- Defjs validates the discriminator and selected object before business logic receives the event.
- TypeScript narrows the decoded union, so each branch exposes only its own fields.
- Adding a provider event requires an explicit Struct option and business branch.

## Production notes

Keep the response union synchronized with the courier's deployed schema version. Decide how unsupported event versions are quarantined before adding them to the contract.

## Inspiration

- [Defjs discriminated-union tests](https://github.com/defjs/defjs/blob/598c218144bc3e5c4844bc8746e08d31010a5309/packages/core/src/struct/constructors.discriminated_union.spec.ts#L5-L58) define the runtime branch-selection behavior used here.
- [TypeScript discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions) describe the static narrowing used by the summary operation.
- [OpenAPI 3.1 Discriminator Object](https://spec.openapis.org/oas/v3.1.1.html#discriminator-object) describes the corresponding schema-selection concept.

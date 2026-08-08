# Offline Inventory Lookup with Mock Fetch

## Problem

An order-entry service needs deterministic inventory examples and focused tests. Replacing `loadInventoryItem` with a stubbed JavaScript object would bypass Defjs path serialization, native request construction, JSON decoding, and response Struct validation.

Replacing only the Fetch boundary keeps the real request definition and business operation in the execution path without opening a server or contacting the inventory service.

## Scenario

The runner requests `label-roll-4x6`, and the injected Fetch function returns 240 available thermal label rolls through the same request construction, JSON decoding, and response Struct used by a real transport.

## Approach

Inject only the native Fetch implementation while keeping normal Defjs request construction, JSON decoding, and response Struct validation unchanged.

## Source map

- [`src/index.ts`](./src/index.ts): Inventory definition, business lookup, native Fetch fixture, one execution, and output.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-transport-mock-fetch start
```

Execution is local and offline. The injected Fetch function handles one in-memory request; no listener, socket, DNS lookup, or external request is used.

## Expected result

```text
{"available":240,"name":"4 x 6 thermal label roll","sku":"label-roll-4x6"}
```

The item came through the production request definition and response Struct rather than a stubbed business return value.

## Key points

- Mock Fetch, not the command builder, business operation, serializer, or validator.
- A mock response must satisfy the same wire contract as a production response.
- This focused boundary replacement complements integration coverage of the deployed service.

## Production notes

Construct the production client with its authenticated Fetch transport and keep the request definition and lookup unchanged. Add broader fixtures only when the business operation gains policies for declared error statuses, cancellation, or retries.

## Inspiration

- [HTTPX custom transports](https://github.com/encode/httpx/blob/b5addb64f0161ff6bfe94c124ef76f6a1fba5254/docs/advanced/transports.md#L246-L266) is the retained official documentation for replacing the network transport in tests while exercising the client above it. Defjs uses `withHTTPHandle` with a Fetch-compatible function; HTTPX request objects, ASGI/WSGI adapters, and Python-specific options are not reproduced.
- [Fetch Standard, fetching](https://fetch.spec.whatwg.org/#concept-fetch) defines the `Request`/`Response` boundary implemented by native Fetch. The fixture implements only the deterministic response portion needed here; browser policy, caching, redirects, and actual network fetching remain out of scope.

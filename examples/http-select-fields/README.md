# HTTP $select Projection for Directory Users

## Problem

An employee directory picker needs only a stable ID and display name. Allowing arbitrary `$select` text encourages over-fetching, while a broad response type lets callers depend on fields the picker never requested.

The operation therefore owns the literal `$select=id,displayName` query and exposes the matching validated response shape.

## Scenario

The runner loads `employee-42`. Its local fixture observes `$select=id,displayName` and returns `id`, `displayName`, and an extra `mail` field. Defjs returns only the two fields declared by the response Struct.

## Approach

Fix `$select=id,displayName` in the request definition and pair it with a narrow response Struct so callers receive only the reviewed projection even if the wire body has extra fields.

## Source map

- [`src/index.ts`](./src/index.ts): Request definition, exported directory operation, local Fetch fixture, and runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-http-select-fields start
```

## Expected result

```text
{"select":"id,displayName","user":{"id":"employee-42","displayName":"Ada Lovelace"}}
```

The selector is fixed at the request boundary, and the fixture's unrequested `mail` field does not enter the business result.

## Key points

- The projection is a request-contract literal rather than caller-built query text.
- The response Struct mirrors the selected business fields.
- `$select` reduces payload shape; it is not an authorization boundary.

## Production notes

Use the provider's authenticated transport and least-privilege scopes, and keep the literal selector synchronized with the response Struct.

## Inspiration

- [Microsoft Graph `$select` documentation](https://learn.microsoft.com/en-us/graph/query-parameters?tabs=http#select-parameter) defines `$select` as the mechanism for choosing returned properties.
- [Microsoft Graph SDK `select`](https://github.com/microsoftgraph/msgraph-sdk-javascript/blob/5438ae90f50ef15d3656f0cf9c5485deee351f19/src/GraphRequest.ts#L514-L529) implements selected-property request construction in the official JavaScript SDK.

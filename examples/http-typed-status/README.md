# Typed HTTP Statuses for Customer Lookup

## Problem

A customer-support dashboard looks up a customer before opening a case. The service returns a customer record for `200` and an error document for `404`; decoding both bodies as the same shape can turn an expected missing customer into invalid customer data.

The business rule is exact: a validated `200` becomes a found customer, while the declared `404` with `code: "customer_not_found"` becomes a missing result. Other request, transport, status, and validation errors remain failures.

## Scenario

The runner requests `customer-1042` from an injected local Fetch fixture and receives Amina Ortiz's `200` record. It then requests `customer-missing` and receives the typed `404` document. Both requests use the same exported lookup operation and never leave the process.

## Approach

Declare separate Structs for `200` and `404`, branch on the Defjs tuple plus runtime status, and build an application union that keeps decoded success data distinct from expected absence.

## Source map

- [`src/index.ts`](./src/index.ts): Request definition, exported lookup operation, local Fetch fixture, and runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-http-typed-status start
```

## Expected result

```text
{"found":{"kind":"found","customer":{"id":"customer-1042","name":"Amina Ortiz"}},"missing":{"kind":"missing","code":"customer_not_found"}}
```

The two results show that success data and typed error data reach different application branches.

## Key points

- Status selects the response Struct before application code consumes the body.
- Declaring a `404` body makes its error data typed; it does not make `404` a transport success.
- Only the declared customer-not-found status becomes business absence.

## Production notes

Replace the fixture with the authenticated customer-service transport and keep the status schemas synchronized with the deployed contract.

## Inspiration

- [OpenAPI 3.1 Responses Object](https://spec.openapis.org/oas/v3.1.1.html#responses-object) defines operation responses by status code.
- [oapi-codegen generated status handling](https://github.com/oapi-codegen/oapi-codegen/blob/c658b6da6575b71e6ef940977103633322d72618/internal/test/references/multipackage/pruned_deps/api.gen.go#L309-L359) preserves per-status response forms in a generated client.
- [RFC 9110, Status Codes](https://www.rfc-editor.org/rfc/rfc9110.html#section-15) defines response status semantics independently of payload content.

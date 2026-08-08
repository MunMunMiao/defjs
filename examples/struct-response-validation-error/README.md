# Response Validation Errors for Inventory Sync

## Problem

A warehouse reader receives HTTP `200` before using an inventory snapshot. Status alone cannot prevent a provider response such as `{ "location": { "aisle": 7 } }` from reaching code that expects an aisle string.

The operation must return only a fully validated snapshot. A malformed `200` is instead exposed as `RESPONSE_VALIDATION_FAILED` with a `StructError` that identifies the invalid field.

## Scenario

The runner loads `sku-2048` from a local fixture. Its response has status `200`, but `location.aisle` is numeric. Defjs rejects the body, and the runner prints only the error code, issue path, and message.

## Approach

Decode the inventory response through its Struct, identify `RESPONSE_VALIDATION_FAILED`, and reduce the first issue to a stable path and message without exposing the rejected value.

## Source map

- [`src/index.ts`](./src/index.ts): The request contract, exported load operation, malformed local response, and concise error inspection.

## Run

From the repository root, after installing the pnpm workspace dependencies:

```sh
pnpm --silent --filter @defjs/example-struct-response-validation-error start
```

The request uses the injected local Fetch function; no server or external traffic is involved.

## Expected result

```text
{"code":"RESPONSE_VALIDATION_FAILED","path":"location.aisle","message":"Expected string at location.aisle, received 7"}
```

The three fields identify the rejected response without turning every `StructError` view into runner output.

## Key points

- HTTP success and response-schema success are separate facts.
- The first Struct issue supplies a stable path and readable validation message.
- Struct diagnostics can include received values; production logging needs an explicit data policy.

## Production notes

Keep the Struct synchronized with the warehouse provider. Send only approved diagnostic fields to bounded logs or quarantine storage, and preserve validation-before-use ordering.

## Inspiration

- [Defjs HTTP validation](https://github.com/defjs/defjs/blob/598c218144bc3e5c4844bc8746e08d31010a5309/packages/core/src/http/http.error.spec.ts#L72-L94) defines `RESPONSE_VALIDATION_FAILED` for an invalid declared response.
- [Defjs `StructError`](https://github.com/defjs/defjs/blob/598c218144bc3e5c4844bc8746e08d31010a5309/packages/core/src/struct/errors.ts#L10-L48) defines the four diagnostic views shown by the runner.
- [RFC 9110, 200 OK](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.3.1) defines HTTP success independently of this application's schema.
- [OWASP Logging Cheat Sheet, Data to Exclude](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html#data-to-exclude) provides guidance for production diagnostic handling.

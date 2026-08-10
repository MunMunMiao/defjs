---
'@defjs/core': minor
---

Make Struct decoding strict and fail-fast, and expose `struct.parse(schema, input)` as an error-first tuple that returns `undefined` on failure.

- Require every non-optional object field and every declared request section; nullable fields remain required, while optional and nullish fields may be omitted.
- Remove Struct zero-value construction, require exact tuple lengths, and stop composite parsing at the first determined issue while retaining `struct.or` and `struct.discriminatedUnion`.
- Replace `SettledResponse` with a single `HttpResponse` type and keep HTTP failure tuples fixed as `[error, undefined, response]`.
- For an exactly matched declared output, treat body representation failures as `RESPONSE_VALIDATION_FAILED` before Struct parsing; no-output and undeclared-status branches keep precedence, and ordinary non-2xx responses no longer synthesize `response.error`.

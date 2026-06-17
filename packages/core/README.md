## @defjs/defjs

## Documentation

Check out the [defjs.org](https://defjs.org) to get started.

## Migration to 0.4

This release intentionally removes legacy public APIs instead of keeping aliases.

| Old API                                                                            | Replacement                                                                                                                |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `withSseOptions`                                                                   | `withSSEOptions`                                                                                                           |
| `createGlobalClient` / `getGlobalClient` / `setGlobalClient` / `resetGlobalClient` | Create a `Client` with `createClient` and call `client.execute(command)`                                                   |
| `cloneClient`                                                                      | Create a new `Client` with `createClient(...)` using the desired options                                                   |
| old error submodules                                                               | import `RequestError`, `createDefinitionError`, `createTransportError`, `ERR_ABORTED`, or `ERR_TIMEOUT` from `@defjs/core` |
| old `ERR_*` string comparisons                                                     | branch on `RequestError.code` and the new error object shape                                                               |

Endpoint definitions are stricter: `defineRequest`, `defineEventStream`, and `defineWebSocket` require an `input` schema whenever `build` is provided. Endpoints without an `input` schema can still omit `build`.

`onInvalidEvent` is an observer. If it throws, the error is ignored and the SSE stream continues.

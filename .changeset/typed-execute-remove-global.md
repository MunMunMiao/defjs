---
'@defjs/core': minor
'@defjs/angular': minor
'@defjs/vue': minor
---

Introduce typed `Client.execute` overloads, a top-level `execute(command, { client })` helper, and remove global client / `cloneClient` / `provideGlobalClient` APIs.

- `Client.execute` is now overloaded per command kind (`http`, `event-stream`, `web-socket`) and returns the correct await result type for each.
- Added `execute(command, { client, signal? })` for explicit, command-first execution.
- Removed `cloneClient`, `getGlobalClient`, `setGlobalClient`, and `resetGlobalClient`. Create a client and pass it explicitly instead.
- Removed `provideGlobalClient` from `@defjs/angular` and `@defjs/vue`; use `provideClient` and inject the client where needed.
- Updated all tests, type tests, and README examples to use the new explicit-client APIs.

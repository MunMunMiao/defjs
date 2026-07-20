---
'@defjs/core': minor
'@defjs/vue': minor
---

Introduce typed `Client.execute` overloads and remove global client / `cloneClient` / `provideGlobalClient` APIs.

- `Client.execute` is now overloaded per command kind (`http`, `event-stream`, `web-socket`) and returns the correct await result type for each.
- Per-request options (`abort`, `timeout`, `context`, `onDownloadProgress`, `heartbeat`, `reconnect`, `queue`, etc.) are now passed as the second argument to `client.execute(command, options)` instead of being attached to the command builder call.
- Command builders (`defineRequest`, `defineEventStream`, `defineWebSocket`) now only accept endpoint input; they no longer carry a `config` field.
- Removed `cloneClient`, `getGlobalClient`, `setGlobalClient`, and `resetGlobalClient`. Create a client and call `client.execute(command)` instead.
- Removed `provideGlobalClient` from `@defjs/vue`; use `provideClient` and inject the client where needed.
- Updated all tests, type tests, and README examples to use the new explicit-client APIs.

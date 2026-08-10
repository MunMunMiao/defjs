---
'@defjs/core': minor
'@defjs/opentelemetry-server': minor
'@defjs/react': minor
'@defjs/vue': minor
---

Harden the published transport and package boundaries.

- **Breaking — Core:** path placeholders now accept raw values, reject empty and dot-segment values, and encode each segment exactly once. HTTP responses without declared output are cancelled instead of downloaded. SSE endpoints now own explicit buffer and queue limits, and WebSocket endpoints own explicit incoming limits while outgoing reconnect buffering defaults to disabled. SSE and WebSocket lifecycle, parser, queue, hook-cancellation, and single-consumer behavior now fail deterministically instead of silently dropping or hanging. The unused `StreamRefState` declaration is removed.
- **Core declarations:** export `StructInput`, `ObjectStruct`, `RequestStruct`, `StructLike`, and `StructMethods` so inferred HTTP, SSE, and WebSocket definitions can emit declarations from packed external consumers.
- **OpenTelemetry:** WebSocket query propagation now defaults to disabled. Set `webSocket.queryPropagation: true` only after reviewing URL logging and disclosure risks. Async hooks are observed without blocking transports or leaking rejected promises, and WebSocket telemetry classifies the discriminated close outcome directly.
- **Release alignment:** all four packages declare Node.js 22 or newer. React, Vue, and OpenTelemetry releases align their `@defjs/core` peer range with this Core release.

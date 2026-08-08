---
'@defjs/core': minor
---

Align `EventStreamData` with runtime event admission when no `default` Struct is declared. Named SSE events now form a discriminated union, so switching on `event.event` narrows `event.data` to the matching Struct output without an additional runtime shape guard. Union event tables distribute correctly, numeric event keys become their wire-format string names, and default lookup ignores inherited object properties while preserving object-literal `__proto__` Struct declarations.

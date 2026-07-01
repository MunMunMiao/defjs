## Task 6: Rewrite doc/core/commands.md

**Files:**
- Modify: `doc/core/commands.md`

**Interfaces:**
- Consumes: current `defineRequest`, `defineEventStream`, `defineWebSocket` signatures and `struct` API.
- Produces: commands doc whose examples use `@defjs/core` only.

- [ ] **Step 1: Replace imports and types**

Change every `import { number, object, string } from '@mobily/ts-belt'` to:

```typescript
import { struct } from '@defjs/core'
```

Replace every `object({...})` with `struct.object({...})`, every `string()` with `struct.string()`, every `number()` with `struct.number()`, every `optional(...)` with `(...).optional()`.

- [ ] **Step 2: Update defineRequest example**

Rewrite the example to:

```typescript
import { defineRequest } from '@defjs/core'
import { struct } from '@defjs/core'

const GetUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.object({
    path: struct.object({ id: struct.string() }),
  }),
  build(ctx, input) {
    ctx.setPathParams(input.path)
  },
  output: [
    { status: 200, body: struct.object({ name: struct.string(), age: struct.number() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ],
})

const command = GetUser({ path: { id: '42' } })
```

- [ ] **Step 3: Update defineEventStream example**

Rewrite the example to:

```typescript
import { defineEventStream, struct } from '@defjs/core'

const Notifications = defineEventStream({
  path: '/notifications',
  events: {
    message: struct.object({ text: struct.string() }),
    userJoined: struct.object({ userId: struct.number(), name: struct.string() }),
  },
})

const command = Notifications()
```

- [ ] **Step 4: Update defineWebSocket example**

Rewrite the example to:

```typescript
import { defineWebSocket, struct } from '@defjs/core'

const ChatSocket = defineWebSocket({
  path: '/chat/:roomId',
  input: struct.object({
    path: struct.object({ roomId: struct.string() }),
  }),
  build(ctx, input) {
    ctx.setPathParams(input.path)
  },
  incoming: {
    message: struct.object({ user: struct.string(), text: struct.string() }),
    system: struct.object({ event: struct.string() }),
  },
  outgoing: {
    sendMessage: struct.object({ text: struct.string() }),
    joinRoom: struct.object({ roomId: struct.string() }),
  },
})
```

- [ ] **Step 5: Update IsInputOptional examples**

Rewrite examples to:

```typescript
// Input with all optional fields — optional
const B = defineRequest({
  method: 'GET',
  path: '/b',
  input: struct.object({
    query: struct.object({ q: struct.string().optional() }),
  }),
  build(ctx, input) {
    ctx.setQueryParams(input.query)
  },
})
```

- [ ] **Step 6: Type-check the full file**

Extract all TypeScript blocks into a single temporary file and run `tsc --noEmit`.

- [ ] **Step 7: Commit**

```bash
git add /Users/munmunmiao/Documents/web/zen-kit/doc/core/commands.md
git commit -m "docs: rewrite commands.md with @defjs/core struct API"
```

---


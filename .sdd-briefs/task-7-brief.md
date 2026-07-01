## Task 7: Fix doc/core/sse.md Build Examples

**Files:**
- Modify: `doc/core/sse.md`

**Interfaces:**
- Consumes: current SSE `build(ctx, input)` API.
- Produces: SSE doc with correct build examples.

- [ ] **Step 1: Replace old build pattern**

Replace:

```typescript
const useRoomStream = defineEventStream({
  path: '/v1/room/:roomId',
  input: struct.object({ roomId: struct.string() }),
  build: ({ roomId }) => ({
    params: { roomId },
  }),
  events: { ... },
})
```

with:

```typescript
const useRoomStream = defineEventStream({
  path: '/v1/room/:roomId',
  input: struct.request({
    path: struct.object({ roomId: struct.string() }),
  }),
  build(ctx, input) {
    ctx.setPathParams(input.path)
  },
  events: {
    chat: struct.json(struct.object({ user: struct.string(), text: struct.string() })),
  },
})
```

- [ ] **Step 2: Review other SSE snippets**

Ensure every SSE snippet uses `struct.request` for input when path/query/headers are needed, and uses `build(ctx, input)` for custom mapping.

- [ ] **Step 3: Type-check**

Extract SSE snippets and run `tsc --noEmit`.

- [ ] **Step 4: Commit**

```bash
git add /Users/munmunmiao/Documents/web/zen-kit/doc/core/sse.md
git commit -m "docs: fix sse.md build examples to use build(ctx, input)"
```

---


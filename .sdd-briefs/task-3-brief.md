## Task 3: Rewrite packages/core/README.md

**Files:**
- Modify: `packages/core/README.md`

**Interfaces:**
- Consumes: current public API from `packages/core/src/index.ts` and `packages/core/design.md`.
- Produces: a concise quick-start README whose example type-checks.

- [ ] **Step 1: Replace README content**

Write to `packages/core/README.md`:

```markdown
# @defjs/core

Type-safe HTTP, SSE, and WebSocket commands for TypeScript.

## Install

```bash
npm install @defjs/core
```

## Quick start

```typescript
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com/v1' })

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ message: struct.string() }),
  },
})

const [error, user] = await client.execute(getUser({ path: { id: 1 } }))

if (error) {
  console.error(error)
} else {
  console.log(user.id, user.name)
}
```

## Core ideas

- **Commands** are type-safe objects created by `defineRequest`, `defineEventStream`, and `defineWebSocket`.
- **Struct** declares request/response shapes and field wire names with `.alias(name)`.
- **Build** lets you manually map parsed input to request parts via `build(ctx, input)`.
- **Client** executes commands and dispatches to the right transport.

See `packages/core/design.md` for the full implementation boundary.
```

- [ ] **Step 2: Type-check the example**

Create a temporary file:

```bash
cat > /tmp/readme-typecheck.ts <<'EOF'
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com/v1' })

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ message: struct.string() }),
  },
})

const [error, user] = await client.execute(getUser({ path: { id: 1 } }))
EOF
```

Run:

```bash
cd /Users/munmunmiao/Documents/web/zen-kit/packages/core
pnpm exec tsc --noEmit --skipLibCheck --module esnext --moduleResolution bundler --target esnext --strict /tmp/readme-typecheck.ts
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add /Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md
git commit -m "docs(core): rewrite README with current struct API"
```

---


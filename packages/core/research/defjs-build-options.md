# defjs `build` 终版合同

记录日期：2026-05-16

最后修订：2026-05-18

本文定义 `defineRequest`、`defineEventStream`、`defineWebSocket` 的 struct-aware request build 合同。

## 总体规则

请求构建只有两条路径：

1. 不写 `build`：`input` 必须是 `struct.request(...)`，由 `path/query/headers/body` request shape 生成 request plan。
2. 写 `build(ctx, input)`：用户完整接管 request plan；request-shaped 默认构建不再混入。

`build(ctx, input)` 只做编排。`input` 不是 actual parsed value，而是当前 endpoint input struct 的 bound view。`ctx.bindXXX(...)` 只能接收从 `input` 取出的 bound view 或 projection，不能接收闭包里的字段 struct、原始 `Input` struct 或 raw runtime value。

```text
definition-time:
  struct creates endpoint-local binding registry from endpoint.input
  run build(ctx, boundInputView) once
  store BuildPlan

request-time:
  parse actual caller input
  materialize BuildPlan into path/query/header/body
```

## Request-shaped Struct

`struct.request(...)` 是默认请求构建的唯一入口。它把 request placement 写在结构层级，而不是写在字段 tag 上。

```ts
const Input = struct.request({
  path: struct.object({
    id: struct.number(),
  }),
  query: struct.object({
    includeProfile: struct.boolean().optional(),
  }),
  headers: struct.object({
    traceId: struct.string().tag(tag.header('x-trace-id')),
  }),
  body: struct.formData({
    uid: struct.number(),
    files: struct.array(struct.file()),
  }),
})
```

默认 materialize：

```text
path <- input.path
query <- input.query
headers <- input.headers
body <- input.body, codec 由 body wrapper 决定
```

body wrapper：

```ts
type RequestBodyStruct =
  | ReturnType<typeof struct.json>
  | ReturnType<typeof struct.urlencoded>
  | ReturnType<typeof struct.formData>
  | ReturnType<typeof struct.text>
  | ReturnType<typeof struct.blob>
  | ReturnType<typeof struct.arrayBuffer>
```

规则：

1. `path`、`query`、`headers` 只能是 flat object。
2. `body` 只能有一个，因为 request shape 只有一个 `body` slot；不需要 endpoint-level body selector。
3. `struct.json(...)` 支持 deep object / array；`struct.urlencoded(...)`、`struct.formData(...)` 只接受 flat field object。
4. `FormData` 不手动设置 `Content-Type`，避免破坏 boundary；其他 body wrapper 管理自己的默认 `Content-Type`。
5. `tag.*('wire-name')` 是 Go-style field tag，只改 wire key，不决定字段属于 query/header/body。
6. `tag.uri/query/header/json/urlencoded/multipart` 不承担 request placement；只作为对应 codec / section 的 field-name metadata。
7. 写了 `build(ctx, input)` 后，`struct.request(...)` 的默认 materialize 不执行。

## Input Bound View

字段只能从 `build(ctx, input)` 的第二参 `input` 取出后绑定。闭包里的字段 struct 只负责声明 struct，不是可绑定 source。

```ts
const Input = struct.request({
  path: struct.object({
    id: struct.number(),
  }),
  headers: struct.object({
    token: struct.string().optional().tag(tag.header('x-token')),
  }),
})

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: Input,
  build(ctx, input) {
    ctx.bindPathParams({ id: input.path.id })
    ctx.bindHeaders({ 'x-token': input.headers.token })
  },
})
```

同一个 struct 实例可以在 input tree 中复用；绑定时仍然必须通过 `input.*` 指明实际 path。

```ts
const id = struct.number()

const Input = struct.request({
  path: struct.object({
    org: struct.object({ id }),
    user: struct.object({ id }),
  }),
})

defineRequest({
  method: 'GET',
  path: '/orgs/:orgId/users/:userId',
  input: Input,
  build(ctx, input) {
    ctx.bindPathParams({
      orgId: input.path.org.id,
      userId: input.path.user.id,
    })
  },
})
```

## Projection

`ctx.bindXXX(...)` 的 object key 是目标 request key，value 是当前 input tree 中的 bound source。

```ts
const Input = struct.request({
  path: struct.object({
    userId: struct.number(),
  }),
  query: struct.object({
    includeProfile: struct.boolean().tag(tag.query('include_profile')),
  }),
  headers: struct.object({
    traceId: struct.string().tag(tag.header('x-trace-id')),
  }),
  body: struct.json(
    struct.object({
      profile: struct.object({
        displayName: struct.string().tag(tag.json('display_name')),
      }),
    }),
  ),
})

const updateUser = defineRequest({
  method: 'PATCH',
  path: '/users/:id',
  input: Input,
  build(ctx, input) {
    ctx.bindPathParams({ id: input.path.userId })
    ctx.bindQueryParams({ include_profile: input.query.includeProfile })
    ctx.bindHeaders({ 'x-trace-id': input.headers.traceId })
    ctx.bindJson({
      name: input.body.profile.displayName,
      data: {
        userId: input.path.userId,
        traceId: input.headers.traceId,
        includeProfile: input.query.includeProfile,
      },
    })
  },
})
```

调用方实际传入：

```ts
{
  path: { userId: 1 },
  query: { includeProfile: true },
  headers: { traceId: '123' },
  body: {
    profile: {
      displayName: 'John Doe',
    },
  },
}
```

JSON body materialize 后发送：

```ts
{
  name: 'John Doe',
  data: {
    userId: 1,
    traceId: '123',
    includeProfile: true,
  },
}
```

## Array Projection

array bound view 支持 JSON-only `map(...)` projection。`map` callback 不读取 actual array item；它只接收 item bound source 模板，用来记录每个 item 的 JSON shape。

```ts
const Input = struct.request({
  body: struct.json(
    struct.object({
      users: struct.array(
        struct.object({
          id: struct.number(),
          name: struct.string(),
          password: struct.string(),
        }),
      ),
    }),
  ),
})

defineRequest({
  method: 'POST',
  path: '/users/bulk',
  input: Input,
  build(ctx, input) {
    ctx.bindJson({
      users: input.body.users.map((user) => ({
        id: user.id,
        name: user.name,
      })),
    })
  },
})
```

调用方实际传入：

```ts
{
  body: {
    users: [
      { id: 1, name: 'Ada', password: 'secret-a' },
      { id: 2, name: 'Grace', password: 'secret-b' },
    ],
  },
}
```

JSON body materialize 后发送：

```ts
{
  users: [
    { id: 1, name: 'Ada' },
    { id: 2, name: 'Grace' },
  ],
}
```

`input.body.users.map(...)` 只能出现在 `ctx.bindJson(...)` 的 JSON projection 内。Type Contract 中的节点叫 `ArrayProjection`，但 v1 只包含 `map` 这一种 method；不支持 `filter`、`reduce`、`flatMap`、按 index 访问、或把 callback 里的 `user.id` 保存到外层再绑定。

nested map 可以读取外层 item scope，例如 `group.users.map(user => ({ groupId: group.id, userId: user.id }))`；struct binding 必须用 scope chain 校验 item source 只在当前 map 或祖先 map projection 内出现。

## Whole-source Binding

object bound view 本身也是 source。

```ts
const Input = struct.request({
  body: struct.json(
    struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
  ),
})

defineRequest({
  method: 'POST',
  path: '/users',
  input: Input,
  build(ctx, input) {
    ctx.bindJson(input.body)
  },
})
```

调用方传入 `{ body: { id: 1, name: 'Ada' } }` 时，实际 JSON body 是：

```ts
{
  id: 1,
  name: 'Ada',
}
```

direct object source 的能力由目标 helper 决定：

| helper                                                                                               | direct object source                                             |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `ctx.bindJson(input)`                                                                                | 允许被 struct JSON codec 接受的 object / array。                 |
| `ctx.bindPathParams(input)`                                                                          | 允许被 struct path codec 接受的 flat object；字段不能 optional。 |
| `ctx.bindQueryParams(input)`                                                                         | 允许被 struct query codec 接受的 flat object。                   |
| `ctx.bindHeaders(input)`                                                                             | 允许被 struct header codec 接受的 flat object。                  |
| `ctx.bindFormUrlEncoded(input)`                                                                      | 允许被 struct urlencoded codec 接受的 flat object。              |
| `ctx.bindFormData(input)`                                                                            | 允许被 struct multipart codec 接受的 flat object。               |
| `ctx.bindArrayBuffer(input)` / `ctx.bindBlob(input)` / `ctx.bindText(input)` / `ctx.bindHtml(input)` | 不接受 object source，只接受 single bound source。               |

## Type Contract

下面是目标合同。名称可以在实现时调整，能力边界必须保持。

```ts
type OutputOf<S> = S extends StructLike<any, infer O, any> ? O : never

declare const BOUND_SOURCE: unique symbol
declare const BOUND_TARGET: unique symbol
declare const ARRAY_PROJECTION: unique symbol

type StructBindTarget =
  | 'pathParam'
  | 'searchParam'
  | 'header'
  | 'jsonBody'
  | 'urlencoded'
  | 'multipartField'
  | 'arrayBufferBody'
  | 'blobBody'
  | 'textBody'
  | 'htmlBody'

type BoundRef<S extends StructLike<any, any, any>, Root> = {
  readonly [BOUND_SOURCE]: {
    readonly owner: Root
    readonly struct: S
  }
}

type BoundFor<TTarget extends StructBindTarget, Root> = BoundRef<StructLike<any, any, any>, Root> & {
  readonly [BOUND_TARGET]?: TTarget
}

type BoundObject<S extends ObjectStruct<any>, TShape, Root> = BoundRef<S, Root> & {
  readonly [K in keyof TShape]: BuildInput<TShape[K], Root>
}

type ObjectSourceFor<TTarget extends StructBindTarget, Root> = BoundObject<ObjectStruct<any>, any, Root> & {
  readonly [BOUND_TARGET]?: TTarget
}

type ArrayProjection<Root> = {
  readonly [ARRAY_PROJECTION]: {
    readonly owner: Root
    readonly method: 'map'
  }
}

type BoundArray<S extends ArrayStruct<infer TItem>, Root> = BoundRef<S, Root> & {
  map<TProjection extends JsonProjection<Root>>(project: (item: BuildInput<TItem, Root>) => TProjection): ArrayProjection<Root>
}

type BuildInput<S, Root = S> =
  S extends ObjectStruct<infer TShape>
    ? BoundObject<S, TShape, Root>
    : S extends ArrayStruct<any>
      ? BoundArray<S, Root>
      : S extends StructLike<any, any, any>
        ? BoundRef<S, Root>
        : never

type JsonProjection<Root> = BoundFor<'jsonBody', Root> | ArrayProjection<Root> | { readonly [targetKey: string]: JsonProjection<Root> }

type KeyValueProjection<TTarget extends 'header' | 'pathParam' | 'searchParam' | 'urlencoded', Root> =
  | Record<string, BoundFor<TTarget, Root>>
  | ObjectSourceFor<TTarget, Root>

type PathParamsProjection<Root> = KeyValueProjection<'pathParam', Root>

type FormDataProjection<Root> = Record<string, BoundFor<'multipartField', Root>> | ObjectSourceFor<'multipartField', Root>

type RequestBodyOptions = {
  contentType?: string | null
}

type HttpBuildContext<Root extends ObjectStruct<any>> = {
  bindPathParams(projection: PathParamsProjection<Root>): void
  bindQueryParams(projection: KeyValueProjection<'searchParam', Root>): void
  bindHeaders(projection: KeyValueProjection<'header', Root>): void

  bindJson(projection: JsonProjection<Root>, options?: RequestBodyOptions): void
  bindFormUrlEncoded(projection: KeyValueProjection<'urlencoded', Root>, options?: RequestBodyOptions): void
  bindFormData(projection: FormDataProjection<Root>): void

  bindArrayBuffer(source: BoundFor<'arrayBufferBody', Root>, options?: RequestBodyOptions): void
  bindBlob(source: BoundFor<'blobBody', Root>, options?: RequestBodyOptions): void
  bindText(source: BoundFor<'textBody', Root>, options?: RequestBodyOptions): void
  bindHtml(source: BoundFor<'htmlBody', Root>, options?: RequestBodyOptions): void
}

type EventStreamBuildContext<Root extends ObjectStruct<any>> = {
  bindPathParams(projection: PathParamsProjection<Root>): void
  bindQueryParams(projection: KeyValueProjection<'searchParam', Root>): void
  bindHeaders(projection: KeyValueProjection<'header', Root>): void
}

type WebSocketBuildContext<Root extends ObjectStruct<any>> = {
  bindPathParams(projection: PathParamsProjection<Root>): void
  bindQueryParams(projection: KeyValueProjection<'searchParam', Root>): void
}
```

`BoundRef` / `BoundObject` / `BoundArray` 不是 struct，也不是 `S & marker`。它们是不透明 binding source，只能由当前 endpoint 的 `build(ctx, input)` 第二参 `input` 产生。闭包里的字段 struct 即使和 input tree 里的字段是同一个实例，也不能单独传给 `ctx.bindXXX(...)`。

`BoundFor<TTarget, Root>` 只表达当前 bound source 可被目标 struct codec 接受。能力判断必须来自 `struct` runtime definition 和现有 codec：`encodeStructValue`、`encodeObjectByTag`、`encodeQueryParams`、`encodeHeaders`、`encodePathParams`、`encodeUrlencoded`、`encodeMultipart`。

`BoundArray.map(...)` 不是 JavaScript runtime array map；它是 definition-time `ArrayProjection` builder。callback 只接收当前 array item 的 bound source 模板，不能读取 actual item value，也不能做 `filter` / `reduce` / 条件分支。返回值只能进入 JSON projection。`ArrayProjection` v1 只有 `method: 'map'`，不预留用户可调用的其他 array helper。

## Struct Binding Metadata

binding metadata 由 `struct` 包的 binding 模块根据 endpoint input struct 派生。path 是 endpoint-local 派生信息，不能写回裸 struct / 字段 struct；binding metadata 必须存放在 endpoint-local registry、private symbol、non-enumerable marker 或 WeakMap 中，不占用用户字段名。

```ts
type BindingMeta = {
  owner: object
  struct: StructLike<any, any, any>
  definition: StructDefinition
  path: readonly PropertyKey[]
  fieldKey: string
  scope?: BindingScope
  tags: ReadonlyMap<symbol, FieldTag>
  optional: boolean
  nullable: boolean
  children?: readonly BindingMeta[]
}

type BindingScope = { kind: 'root' } | { array: BindingMeta; id: object; kind: 'arrayItem'; parent: BindingScope }

type ArrayProjectionMeta = {
  owner: object
  method: 'map'
  source: BindingMeta
  itemScope: Extract<BindingScope, { kind: 'arrayItem' }>
  projection: JsonPlan
}

type BindingRegistry = {
  owner: object
  byArrayProjection: WeakMap<object, ArrayProjectionMeta>
  byBoundView: WeakMap<object, BindingMeta>
}
```

registry 构建规则归 `struct` 包；build plan 只接收 `{ registry, input }` 并调用 resolve API：

```ts
function createStructBindingInput(inputStruct) {
  const registry = {
    owner: {},
    byArrayProjection: new WeakMap(),
    byBoundView: new WeakMap(),
  }

  const input = createStructBoundView(inputStruct, registry, [], new Set(), { kind: 'root' })
  return { registry, input }
}

function createStructBoundView(struct, registry, path, stack, scope) {
  const meta = createBindingMeta(struct, registry.owner, path, scope)

  if (isObjectStruct(struct)) {
    if (stack.has(struct)) {
      throw new DefinitionError('recursive object binding must be bound as a whole source')
    }

    stack.add(struct)
    const view = Object.create(null)
    const children = []
    for (const field of getStructFields(struct)) {
      view[field.key] = createStructBoundView(field.struct, registry, [...path, field.key], stack, scope)
      children.push(registry.byBoundView.get(view[field.key]))
    }
    stack.delete(struct)
    meta.children = children
    registry.byBoundView.set(view, meta)
    return Object.freeze(view)
  }

  if (isArrayStruct(struct)) {
    const view = createOpaqueBoundRef(struct)
    view.map = (project) => {
      const itemScope = { array: meta, id: {}, kind: 'arrayItem', parent: meta.scope }
      const itemStruct = getArrayItemStruct(struct)
      const itemInput = createStructBoundView(itemStruct, registry, [], new Set(), itemScope)
      const projection = assertJsonProjection(registry, project(itemInput), itemScope)
      const arrayProjection = createOpaqueArrayProjection()
      registry.byArrayProjection.set(arrayProjection, {
        owner: registry.owner,
        method: 'map',
        source: meta,
        itemScope,
        projection,
      })
      return arrayProjection
    }
    registry.byBoundView.set(view, meta)
    return Object.freeze(view)
  }

  const view = createOpaqueBoundRef(struct)
  registry.byBoundView.set(view, meta)
  return view
}
```

binding 解析规则：

```ts
function resolveStructBinding(registry, value) {
  const viewMeta = registry.byBoundView.get(value)
  if (viewMeta) {
    return viewMeta
  }

  throw new DefinitionError('bind value must come from build input bound view')
}
```

## BuildPlan

```ts
type BuildPlan = {
  pathParams?: KeyValuePlan
  queryParams?: KeyValuePlan
  headers?: KeyValuePlan
  body?: BodyPlan
}

function createHttpBuildContext(registry, plan) {
  return {
    bindPathParams(projection) {
      plan.pathParams = assertKeyValueProjection(registry, projection, { wire: 'uri', capability: 'pathParam', required: true })
    },

    bindQueryParams(projection) {
      plan.queryParams = assertKeyValueProjection(registry, projection, { wire: 'query', capability: 'searchParam' })
    },

    bindHeaders(projection) {
      plan.headers = assertKeyValueProjection(registry, projection, { wire: 'header', capability: 'header' })
    },

    bindJson(projection, options) {
      setBodyPlan(plan, {
        kind: 'json',
        projection: assertJsonProjection(registry, projection),
        options,
      })
    },

    bindFormUrlEncoded(projection, options) {
      setBodyPlan(plan, {
        kind: 'urlencoded',
        projection: assertKeyValueProjection(registry, projection, { wire: 'urlencoded', capability: 'urlencoded' }),
        options,
      })
    },

    bindFormData(projection) {
      setBodyPlan(plan, {
        kind: 'multipart',
        projection: assertFormDataProjection(registry, projection, { wire: 'multipart', capability: 'multipartField' }),
      })
    },

    bindArrayBuffer(source, options) {
      setBodyPlan(plan, { kind: 'arrayBuffer', source: assertSingleSource(registry, source, 'arrayBufferBody'), options })
    },

    bindBlob(source, options) {
      setBodyPlan(plan, { kind: 'blob', source: assertSingleSource(registry, source, 'blobBody'), options })
    },

    bindText(source, options) {
      setBodyPlan(plan, { kind: 'text', source: assertSingleSource(registry, source, 'textBody'), options })
    },

    bindHtml(source, options) {
      setBodyPlan(plan, { kind: 'html', source: assertSingleSource(registry, source, 'htmlBody'), options })
    },
  }
}

function setBodyPlan(plan, body) {
  if (plan.body) {
    throw new DefinitionError('request body can only be bound once')
  }
  plan.body = body
}
```

capability 校验必须调用 struct codec / definition helper，不维护独立值分类。

```ts
function tryResolveStructBinding(registry, value) {
  return registry.byBoundView.get(value)
}

function tryResolveArrayProjection(registry, value) {
  return registry.byArrayProjection.get(value)
}

function assertKeyValueProjection(registry, projection, options) {
  const source = tryResolveStructBinding(registry, projection)
  if (source) {
    assertStructObjectCapability(source, options.capability)
    return { kind: 'objectSource', source, target: options.wire }
  }

  const fields = Object.create(null)
  for (const [targetKey, value] of Object.entries(projection)) {
    const meta = resolveStructBinding(registry, value)
    assertStructFieldCapability(meta, options.capability)
    fields[targetKey] = meta
  }
  return { kind: 'record', fields }
}

function assertJsonProjection(registry, projection, scope = { kind: 'root' }) {
  const source = tryResolveStructBinding(registry, projection)
  if (source) {
    assertSourceScope(source, scope)
    assertStructCapability(source, 'jsonBody')
    return { kind: 'source', source, target: 'json' }
  }

  const arrayProjection = tryResolveArrayProjection(registry, projection)
  if (arrayProjection) {
    assertArrayProjectionScope(arrayProjection, scope)
    return { kind: 'arrayProjection', ...arrayProjection }
  }

  const fields = Object.create(null)
  for (const [targetKey, value] of Object.entries(projection)) {
    fields[targetKey] = assertJsonProjection(registry, value, scope)
  }
  return { kind: 'record', fields }
}

function assertSourceScope(source, scope) {
  if (source.scope?.kind !== 'arrayItem') {
    return
  }
  if (!scopeContains(scope, source.scope)) {
    throw new DefinitionError('array item source must be used inside its array projection')
  }
}

function assertArrayProjectionScope(arrayProjection, scope) {
  assertSourceScope(arrayProjection.source, scope)
  if (scopeContains(scope, arrayProjection.itemScope)) {
    throw new DefinitionError('array projection cannot recursively contain itself')
  }
}

function scopeContains(scope, expected) {
  for (let current = scope; current.kind === 'arrayItem'; current = current.parent) {
    if (current.id === expected.id) {
      return true
    }
  }
  return false
}

function assertSingleSource(registry, source, target) {
  const meta = resolveStructBinding(registry, source)
  assertStructCapability(meta, target)
  return meta
}
```

## Materialize

```ts
const SKIP = Symbol('skip')

function materializeBuildPlan(plan, parsedInput) {
  return {
    params: materializeKeyValuePlan(plan.pathParams, parsedInput, { skipUndefined: false }),
    query: materializeKeyValuePlan(plan.queryParams, parsedInput, { skipUndefined: true }),
    headers: materializeHeadersPlan(plan.headers, parsedInput),
    ...materializeBodyPlan(plan.body, parsedInput),
  }
}

function materializeKeyValuePlan(plan, parsedInput, options) {
  if (!plan) {
    return undefined
  }

  if (plan.kind === 'objectSource') {
    return materializeObjectSource(plan.source, parsedInput, plan.target, options)
  }

  const output = Object.create(null)
  for (const [targetKey, source] of Object.entries(plan.fields)) {
    const value = materializeSource(source, parsedInput)
    if (value === SKIP) {
      if (options.skipUndefined) {
        continue
      }
      throw new DefinitionError(`required path param "${targetKey}" resolved to undefined`)
    }
    output[targetKey] = value
  }
  return output
}

function materializeJsonProjection(projection, parsedInput, scopeValues = new Map()) {
  if (projection.kind === 'source') {
    return materializeWholeSource(projection.source, parsedInput, projection.target, scopeValues)
  }

  if (projection.kind === 'arrayProjection') {
    if (projection.method !== 'map') {
      throw new DefinitionError('unsupported array projection method')
    }
    const items = materializeSource(projection.source, parsedInput, scopeValues)
    if (items === SKIP) {
      return SKIP
    }
    if (!Array.isArray(items)) {
      throw new DefinitionError('array projection source must resolve to an array')
    }
    return items.map((item) => {
      const nextScopeValues = new Map(scopeValues)
      nextScopeValues.set(projection.itemScope.id, item)
      return materializeJsonProjection(projection.projection, parsedInput, nextScopeValues)
    })
  }

  const output = Object.create(null)
  for (const [targetKey, child] of Object.entries(projection.fields)) {
    const value = materializeJsonProjection(child, parsedInput, scopeValues)
    if (value === SKIP) {
      continue
    }
    output[targetKey] = value
  }
  return output
}

function materializeObjectSource(source, parsedInput, target, options, scopeValues = new Map()) {
  const output = Object.create(null)
  for (const child of source.children ?? []) {
    const key = resolveWireKey(child, target)
    const value = materializeSource(child, parsedInput, scopeValues)
    if (value === SKIP) {
      if (options.skipUndefined) {
        continue
      }
      throw new DefinitionError(`required field "${key}" resolved to undefined`)
    }
    output[key] = value
  }
  return output
}

function materializeWholeSource(source, parsedInput, target, scopeValues = new Map()) {
  if (source.definition.kind === 'object') {
    return materializeObjectSource(source, parsedInput, target, { skipUndefined: true }, scopeValues)
  }

  return materializeSource(source, parsedInput, scopeValues)
}

function materializeSource(source, parsedInput, scopeValues = new Map()) {
  const base = source.scope?.kind === 'arrayItem' ? scopeValues.get(source.scope.id) : parsedInput
  const value = getByPath(base, source.path)
  if (typeof value === 'undefined') {
    return source.optional ? SKIP : undefined
  }
  return encodeProjectedValue(source.struct, value, source.codec)
}

function resolveWireKey(source, target) {
  return source.tags.get(target)?.name ?? source.fieldKey
}
```

## Request-shaped Default Build

默认 request materialization 按 transport 裁剪 `struct.request(...)` sections。

| request section | HTTP | SSE  | WebSocket |
| --------------- | ---- | ---- | --------- |
| `path`          | 使用 | 使用 | 使用      |
| `query`         | 使用 | 使用 | 使用      |
| `headers`       | 使用 | 使用 | 禁止      |
| `body`          | 使用 | 禁止 | 禁止      |

body codec 由 `body` wrapper 决定：

```text
no body section -> no body
struct.json(...) -> JSON body
struct.urlencoded(...) -> URLSearchParams body
struct.formData(...) -> FormData body
struct.text() -> string body
struct.blob() -> Blob body
struct.arrayBuffer() -> ArrayBuffer body
```

`struct.request(...)` 不需要也不接受 endpoint-level body selector。显式 `build` 不读取 request-shaped 默认输出；用户写出的 `ctx.bindXXX(...)` 是唯一来源。

## Transport Context

| ctx 方法                                 | HTTP | SSE  | WebSocket |
| ---------------------------------------- | ---- | ---- | --------- |
| `bindPathParams(projection)`             | 合法 | 合法 | 合法      |
| `bindQueryParams(projection)`            | 合法 | 合法 | 合法      |
| `bindHeaders(projection)`                | 合法 | 合法 | 非法      |
| `bindJson(projection)`                   | 合法 | 非法 | 非法      |
| `bindFormUrlEncoded(projection)`         | 合法 | 非法 | 非法      |
| `bindFormData(projection)`               | 合法 | 非法 | 非法      |
| `bindArrayBuffer(ref)` / `bindBlob(ref)` | 合法 | 非法 | 非法      |
| `bindText(ref)` / `bindHtml(ref)`        | 合法 | 非法 | 非法      |

`ctx` 不暴露 `setXXX`、`context`、`withCredentials`、`bindBody`、`bindXml`。WebSocket 不支持 browser API 不存在的 custom handshake headers 或 request body。

## Implementation Requirements

1. `build(ctx, input)` 只在 definition-time 生成 `BuildPlan`，不能读取 actual parsed input。
2. registry 必须带 owner token，禁止绑定其他 endpoint 的 struct 或伪造对象。
3. `ctx.bindXXX(...)` 入参必须来自 `build` 第二参 `input`；闭包里的字段 struct、原始 `Input` struct 和其他 endpoint 的 bound view 都报 definition error。
4. path/query/header/urlencoded/multipart/json 的能力判断必须来自 struct runtime definition 和现有 codec。
5. `input.array.map(item => projection)` 只允许出现在 JSON projection 中，并生成 `ArrayProjection`；callback 里的 item bound source 只能在该 `map` projection 的 scope 内使用。
6. optional `undefined` 在 query/header/urlencoded/formData/json object projection 中 skip；path param 为 `undefined` 报错。
7. 多个 body helper 连续调用报 definition error。
8. same-source 重复 wire key 报 definition error；重复 query 值应建模为 array 字段。
9. 默认请求构建只接受 `struct.request(...)` root；primitive / array / union root input 只 parse，不做默认 request materialize。

## Test Requirements

runtime tests：

1. HTTP 默认 request materialization 从 `struct.request({ path, query, headers, body })` 生成 request。
2. 无 `body` section 不发送 body；`body` wrapper 决定 JSON/urlencoded/multipart/text/blob/arrayBuffer codec。
3. `build` 存在时完全不执行 request-shaped 默认构建。
4. closure 裸 struct 不能绑定，即使它在 input tree 中唯一也报 definition error。
5. `input.*` bound view 能绑定 reused struct 的具体 path。
6. root `input` 可以作为 `bindJson(input)` whole-source。
7. `ctx.bindJson(input.profile)` 可以发送 nested object；`ctx.bindJson(input.items)` 可以发送 whole-array source。
8. `ctx.bindJson({ users: input.users.map(user => ({ id: user.id, name: user.name })) })` 可以按 item projection 重组 array。
9. array item bound source 逃逸到 map callback 外、出现在 query/header/formData projection、或在无关 map scope 复用都报 definition error。
10. `ctx.bindQueryParams(input)`、`ctx.bindHeaders(input)`、`ctx.bindFormUrlEncoded(input)` 在 struct codec 可编码的 flat object 上合法，遇到 nested object / binary field 报 definition error。
11. `ctx.bindFormData(input)` 在 struct multipart codec 可编码的 flat object 上合法，遇到 nested object 报 definition error。
12. `ctx.bindArrayBuffer(input)`、`ctx.bindBlob(input)`、`ctx.bindText(input)`、`ctx.bindHtml(input)` 拒绝 object source，只接受 single matching bound source。
13. optional query/header/form field 为 `undefined` 时 skip；path param `undefined` 报错。
14. SSE 默认 request materialization 支持 path/query/headers，配置 body section 或手写 body/withCredentials 报 definition error。
15. WebSocket 默认 request materialization 支持 path/query，配置 headers/body section 或手写 headers/body/withCredentials 报错。

type tests：

1. `ctx.bindPathParams({ id: input.id })` 接受当前 build input 中被 struct path codec 接受的 required bound view。
2. `ctx.bindQueryParams({ page: input.page })` 接受被 struct query codec 接受的 optional / repeated-value bound view。
3. `ctx.bindJson({ name: input.name })` 接受被 struct JSON codec 接受的 bound view，拒绝 JSON codec 不支持的 definition。
4. `ctx.bindJson(input)` 类型层接受 root object bound view；`ctx.bindJson(Input)` 和 `ctx.bindJson({ name })` 类型层拒绝。
5. `ctx.bindQueryParams(input)` 类型层只接受 struct query codec 可编码的 flat object source。
6. `ctx.bindArrayBuffer(input)` 类型层拒绝 object source。
7. SSE ctx 不暴露 body helpers；WebSocket ctx 不暴露 headers/body helpers。
8. HTTP ctx 不暴露 `withCredentials`、`context`、`setXXX`、`bindXml`、泛 `bindBody`。
9. 用户字段名为 `path`、`struct`、`fieldKey` 时不和 binding metadata 冲突。
10. 伪造 `{ path, struct }` 结构不能通过 `ctx.bindXXX` 类型或 runtime assert。

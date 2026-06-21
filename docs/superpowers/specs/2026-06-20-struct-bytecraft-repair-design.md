# struct 字节匠人式修复设计

日期：2026-06-20
状态：待用户审核

## 背景

本设计基于当前 `packages/core/src/struct` 已经进行中的 alias-only 改造，并继续推进更激进的极简修复。上一轮 review 的核心结论是：`struct` 的主要复杂度不是单个函数太长，而是同一套语义被拆散到多个解释器里：

- `parse.ts` 维护 missing/null/zero-value 规则。
- `encode.ts` 维护 encode 与 runtime branch matching。
- `codec/common.ts` 为 alias decode 又写了一套 struct traversal。
- `codec/flat.ts`、`query.ts`、`urlencoded.ts`、`multipart.ts` 与 request builder 各自处理 flat 字段投影。
- `request` / `requestBody` 作为 struct kind 把 endpoint/request 语义混入核心数据结构模型。
- `public_api.ts` 暴露了过多内部类型，使后续收缩变成兼容性负担。
- `StructLike` 同时携带 `[TYPES]` 与 `_struct` 两套 phantom，运行时也 materialize 了纯类型字段。

本设计选择“方案 C：激进极简分波推进”。目标不是一次性把所有文件揉成一个大 visitor，而是把每类规则收敛成唯一来源，逐层删掉重复模型。

## 相关依据

本设计需要与以下已有文档和代码保持一致：

- `docs/superpowers/specs/2026-06-19-struct-alias-only-design.md`
- `docs/superpowers/plans/2026-06-19-struct-alias-only-redesign.md`
- `docs/superpowers/plans/2026-06-17-content-codec-api-redesign.md`
- `packages/core/src/struct/README.md`
- `packages/core/src/struct/types.ts`
- `packages/core/src/struct/runtime.ts`
- `packages/core/src/struct/parse.ts`
- `packages/core/src/struct/encode.ts`
- `packages/core/src/struct/codec/common.ts`
- `packages/core/src/struct/codec/flat.ts`
- `packages/core/src/internal/request_builder.ts`

## 总目标

`struct` 最终应保持一个小而硬的模型：

> struct 描述边界结构；alias 只描述字段 wire key；request 只是 endpoint 输入投影，不应成为核心 struct 解释器里的第二个 object 系统。

落地后应满足：

1. 缺失值规则只有一处。
2. alias/wire key 规则只有一处。
3. runtime branch matching 只有一处。
4. flat 字段投影只有一处。
5. request body 内部只有一种 descriptor。
6. public API 只暴露用户需要理解的概念。
7. struct 类型 phantom 只保留一个载体，运行时不背纯类型字段。

## 设计原则

### 1. 语义唯一来源

如果一条规则影响多个协议目标，它必须被放到共享内核，而不是在 JSON、query、urlencoded、multipart、request builder 中各写一遍。

典型唯一来源：

- `wireKey = field.alias ?? field.key`
- optional/null/nullish/zero-value 缺失值策略
- union/discriminatedUnion/intersection runtime branch selection
- object declared fields resolution
- flat scalar/repeated value policy

### 2. local key 与 wire key 分层

`parse.ts` 继续只理解 TypeScript/local key。wire alias 只在 codec/request-builder 的 normalize/encode 层生效：

- `decodeJson`：wire key 归一化到 local key，再交给 parse。
- flat codec：从 local object 读字段，向 wire target 写 alias key。
- normal `parseStructValue`：不同时支持 local key 与 wire key。

alias 不改变：

- `Infer<T>`
- parse output key
- request input/output type
- optional/null/nullish 行为
- body codec
- request section placement

### 3. 不引入第二套 tag 语义

本修复延续 alias-only 设计：这是破坏性 cleanup，不保留 tag 兼容 shim。

删除或保持删除：

- `.tag(...)`
- `tag.*(...)`
- `createTagNamespace`
- `getFieldTag(s)`
- `FieldTag*`
- `TagNamespace*`
- `JsonCodecOptions.requireTag`
- struct custom metadata extension

不新增：

- `requireAlias`
- per-target alias
- omit/private/expose/filter
- alias-based placement

### 4. 保留 Go-style missing/null 语义

不改变既有 Go `encoding/json` 风格：

- 缺失字段走零值。
- `.optional()` 字段可省略。
- `.null()` / `.nullish()` 保持现有 null/undefined 输出语义。
- alias 缺失按缺失字段处理。
- encode 时 `undefined` optional 字段跳过。

任何极简化都不能把缺失字段改成严格错误。

### 5. request 是 endpoint 元数据，不是第二个 object 模型

public 写法可以继续存在：

```ts
struct.request({
  path: struct.object(...),
  query: struct.object(...),
  headers: struct.object(...),
  body: struct.json(...),
})
```

但内部应逐步降高度：

- request sections 是固定 section metadata。
- path/query/headers 都是 object struct + target metadata。
- body codec 是统一 body descriptor。
- `blob` / `arrayBuffer` 不再作为 body 例外绕过 descriptor。
- parse/encode/zero 不应为 request 复刻一套 object 子系统。

### 6. explicit build key 不被 alias 改写

`build(ctx, input)` 中用户手写 object literal key 就是最终 wire key。

```ts
ctx.setJson({
  display_name: input.body.displayName,
})
```

这里 `display_name` 不再被来源字段 alias 二次改写。

但 whole-source bound value 仍递归应用 source struct alias：

```ts
ctx.setJson(input.body)
```

这种情况下 `input.body` 自带 struct 路径，内部对象字段应按目标 codec 使用 alias 输出。

## 非目标

本设计不做：

1. 不改变业务 validation 能力；不新增 `email()`、`min()`、`int()` 等 DSL。
2. 不改变 transport 自动猜 JSON 的策略；content-codec/SSE/WebSocket 原始值规则作为独立变更处理。
3. 不引入 per-target alias。
4. 不引入字段隐藏/filter/expose。
5. 不支持 tag 兼容 shim。
6. 不把 normal parse 改成同时接受 local key 和 wire key。
7. 不把所有 struct 解释逻辑一次性改成宏大 visitor；只在重复语义已清晰时抽小内核。

## 修复波次

### Wave 1：测试护栏与 correctness 修复

先补测试再改实现，锁定最容易回归的事实。

#### 1.1 flat 缺失字段 encode

问题：`encodeFlatByAlias()` 直接对每个 declared field 调 `encodeStructValue(field.struct, value[field.key])`。缺失字段会把 `undefined` 传进 primitive encode。

设计：

- flat encode 在调用 child encode 前先检查 `hasOwnKey(value, field.key)`。
- 缺失字段跳过。
- 显式 `undefined` 字段跳过。
- 这与 JSON alias encode 的现有策略对齐。

覆盖：

- optional `date` / `bigint` 缺失不崩。
- query/path/headers/urlencoded/multipart 都共享该行为。

#### 1.2 nullable primitive encode

问题：`parseValue()` 已接受 nullable null，但 `encodeValue()` 在 primitive 分支先调用 `definition.encode(value)`。

设计：

- `encodeValue()` 在 kind switch 前处理 flags：
  - `value === null && (definition.kind === 'null' || definition.flags.nullable)` 直接返回 `null`。
  - `value === undefined && definition.flags.optional` 直接返回 `undefined`。
- `matchesDefinition()` 也采用同源 flags 前置判断。

覆盖：

- `struct.date().null()` encode null 不崩。
- `struct.bigint().null()` encode null 不崩。
- nullable 字段在 union/object branch matching 中可匹配。

#### 1.3 wire key 冲突检测

问题：同一 object shape 内两个字段可得到同一个 wire key，编码时静默覆盖。

设计：

- 在 object field metadata resolution 阶段统一计算 `wireKey`。
- 同一 object shape 内发现重复 `wireKey` 时抛 `TypeError`。
- 错误消息包含冲突 wire key 与字段名。
- JSON、flat、request builder 不再各自决定冲突策略。

覆盖：

- `{ name, displayName.alias('name') }` 抛错。
- 两个字段 alias 到同一 key 抛错。
- 无冲突时输出不变。

#### 1.4 union alias encode 歧义

问题：alias-aware 非判别 `struct.or` 对空数组、空对象、同类型字段等歧义值按 option 顺序选择 wire key。

设计：

- 对多分支同时匹配且会产生不同 wire key 的 object/collection branch，抛歧义错误。
- 推荐用户使用 `struct.discriminatedUnion` 或显式 struct。
- 若多个匹配分支输出 wire key 完全一致，可保留现有 first-match 行为。

覆盖：

- 空数组同时匹配多个 array option 且 alias 不同则抛错。
- 空 object 同时匹配多个 object option 且 alias 不同则抛错。
- discriminatedUnion 不受影响。

### Wave 2：收敛 missing、fields、branch matching

#### 2.1 missing policy 单一来源

设计：

- 新增或保留一个内部 helper：`buildMissingValue(struct, path, mode)` / `resolveMissingValue(struct, path, mode)`。
- `parseMissingValue()` 只包装 `success(resolveMissingValue(...))`。
- `safeZeroValue()` 与 object/request/tuple/union zero-value 继续复用同源 helper。

收益：

- optional/null/nullish/zero-value 优先级只维护一份。

#### 2.2 object fields resolution

设计：

引入内部 field metadata：

```ts
interface ResolvedStructField {
  readonly key: string
  readonly alias: string | undefined
  readonly wireKey: string
  readonly struct: RuntimeStruct
}
```

要求：

- shape getter 展开、assertStruct、alias 读取、wireKey 生成、冲突检测集中在 field resolution。
- `getStructFields()` 可继续返回 public 视图，但内部热路径使用 cached resolved fields。
- cache 粒度从 runtime struct 收窄到 object definition/declared shape，派生 struct 复用同一 field resolution。

收益：

- `getStructFields()` 不再每次 Object.entries + map。
- JSON、flat、request builder 不再各自读 alias。

#### 2.3 branch matching 模块中立化

设计：

- 将 `matchesDefinition()` 从 `encode.ts` 移到中立内部模块，例如 `match.ts` 或 `selector.ts`。
- 对外提供小入口：
  - `matchesRuntimeValue(struct, value)`
  - `selectUnionOption(options, value)`
- encode、alias decode、intersection/union 分支都复用它。
- primitive input guard 与 output runtime guard 拆开：
  - `definition.is` 继续表示 parse input/wire accept。
  - 新增 runtime/output guard 供 encode/match 使用，至少覆盖 date/bigint。

收益：

- 不再让 codec/common.ts 依赖 encode.ts 的内部函数。
- date/bigint 的 wire 输入宽容性不会污染 runtime branch matching。

### Wave 3：codec walker 收敛

#### 3.1 alias decode 不再拥有完整 struct walker

当前 `decodeAliasedField()` 自己处理 object/array/tuple/record/or/discriminatedUnion/intersection。目标是把 alias 限定成 object field key resolver。

设计：

- 建立一个窄的 struct transform/visitor，只覆盖“递归进入子 struct”的机械部分。
- alias decode 只提供：
  - object 字段如何从 wire key 读取 local key。
  - union/discriminatedUnion 如何选择分支。
- array/tuple/record/intersection 的递归结构走共享 transform。

#### 3.2 discriminatedUnion alias 路由

设计：

- 构造或 field resolution 阶段获得 discriminator 字段的 wire key。
- decode 时先读 raw input 的 discriminator wire key。
- 命中 map 后只 normalize 目标 option。
- 如果不同 option 的 discriminator wire key 不一致，必须明确处理：
  - 若能唯一读到一个 discriminator 值，则路由。
  - 多个候选 key 同时存在且指向不同 option，则抛歧义错误。
  - 缺失则保留现有 invalid_union 错误语义。

#### 3.3 intersection object-only fast path

设计：

- 对纯 object intersection 可收集 flattened object fields 并一次遍历。
- 有重复 local key/wire key、非 object branch、或需要保持 right-side projection 时回退现有双分支实现。

目标是优化明确对象组合，不改变非对象 intersection 兼容语义。

### Wave 4：flat codec 与 request builder 统一字段投影

#### 4.1 flat projection kernel

设计一个内部 helper，例如：

```ts
forEachEncodedWireField(struct, value, policy, sink)
```

职责：

- 校验 object struct。
- 校验 object value。
- 遍历 resolved fields。
- 按 local key 读取值。
- 缺失/undefined skip。
- 调 child encoder。
- 用 `wireKey` 写入 sink。

调用方只决定：

- target 容器：plain record / URLSearchParams / FormData
- scalar policy
- array repeated policy
- Blob/File 是否接受
- 错误 label

#### 4.2 explicit projection 边界

request builder 中：

- explicit object literal key 不改写。
- bound whole-source object 走 source struct alias。
- bound scalar projection 不因来源字段 alias 改名。
- nested bound object 在 JSON/FormData/urlencoded 等目标中递归应用 alias。

覆盖 `setJson`、`setQueryParams`、`setPathParams`、`setHeaders`、`setFormUrlEncoded`、`setFormData`。

### Wave 5：public API 收缩

根入口保留最小公共面：

- `struct`
- `Infer`
- `StructError`
- `setErrorMap`
- `ErrorMap`
- `StructIssue`、formatted/flattened error 类型
- 一个 opaque `Struct` / `AnyStruct` 类型约束，如 endpoint 泛型需要

移出或停止公开：

- `ArrayStruct`
- `ObjectStruct`
- `ObjectShape`
- `RecordStruct`
- `TupleStruct`
- `UnionStruct`
- `DiscriminatedUnionStruct`
- `RequestBodyCodec`
- `RequestBodyStruct`
- `RequestStruct`
- `RequestShape`
- `StructLike as StructLike`

字段 introspection 策略：

- 默认降为内部 API。
- 如果 endpoint 或外部用户确实需要，只保留 `getStructFields()` 作为单独明确的 public introspection，并保证返回的是只读视图。
- 不再把内部 struct 建模类型作为 public contract。

这是 breaking cleanup；对应类型负向测试和文档需一起更新。

### Wave 6：request/requestBody 降高度

#### 6.1 body descriptor 统一

内部统一：

```ts
interface RequestBodyDescriptor {
  readonly codec: 'json' | 'urlencoded' | 'formData' | 'text' | 'blob' | 'arrayBuffer'
  readonly struct: RuntimeStruct
}
```

public 写法仍可保留：

- `struct.json(struct)`
- `struct.urlencoded(shape)`
- `struct.formData(shape)`
- `struct.text()`
- `struct.blob()`
- `struct.arrayBuffer()`

但 `createRequestStruct()` 内部把 direct binary body 也规范化成 descriptor。

#### 6.2 request sections 预计算

`RequestDefinition` 内部保存预计算 sections：

```ts
readonly sections: readonly RequestSection[]
```

parse/encode/zero/request_builder 都遍历该列表，而不是每次 `getRequestSections()` 分配新数组。

#### 6.3 request 不复刻 object 解释器

实现可分两阶段：

1. 保留 `kind: 'request'`，但 parse/encode/zero 使用共享 section helper。
2. 后续如果影响面可控，再考虑把 request 表示为 object struct + metadata。

本设计允许第一阶段作为实现落点，避免一次性改变所有 endpoint 泛型。

### Wave 7：StructLike phantom 极简化

推荐方向：保留 `_struct`，删除 `[TYPES]`。

理由：

- 当前 `Infer`、`ObjectInput`、`FieldOutput` 等主要读取 `_struct`。
- `[TYPES]` 未参与 runtime identity；`isStruct` 只依赖 `[DEFINITION]`。
- 运行时 materialize `[TYPES]` 属于纯类型负担。

设计：

- 从 `StructLike`、专用 struct interfaces、`RuntimeStruct` 中删除 `[TYPES]` carrier。
- 删除 `runtime.ts` 中 `[TYPES]: undefined as never`。
- 删除相关 coverage smoke test。
- 保留 `_struct` 作为唯一 phantom type slot。
- 进一步优化时，可把 `_struct` 也只留在类型声明，不 materialize 到 runtime object；若担心 JS 用户反射，先作为第二步。

同时收紧 `isStruct`：

- 使用 `Object.hasOwn(value, DEFINITION)`。
- 校验 definition 是对象。
- 校验 `kind` 是已知 struct kind。
- 校验 flags 基本形态。

## 错误处理与安全边界

必须保留：

- 所有 object output 使用 `Object.create(null)` 或等价 null-prototype 容器。
- wire key 读写使用 own-key 检查。
- `__proto__`、`constructor` 等危险 key 不污染全局原型。
- `formatPath()` 的人类可读展示可后续修，但结构化 `StructIssue.path` 仍是权威数据。

冲突处理：

- 同 object shape 内 wire key 冲突：抛错。
- union 多分支匹配且输出 wire key 不同：抛歧义错误。
- discriminatedUnion alias discriminator 多 key 冲突：抛歧义错误。
- intersection 中 object 合并 wire key 冲突：优先抛错；若保持 right-side 覆盖，则必须限定为 legacy fallback 并测试锁定。

## 文档策略

需要同步更新：

- `packages/core/src/struct/README.md`
- `packages/core/design.md`
- `README.md`
- `doc/**/core/struct.md`
- `doc/**/guide/examples.md`
- `doc/**/guide/getting-started.md`

文档应表达：

- `struct` 是边界结构模型，不是 validation DSL。
- `Infer` 是顶层类型 helper：`import { struct, type Infer } from '@defjs/core'`。
- alias 是唯一字段 wire-name 机制。
- request placement 只由 `struct.request` 和 `build(ctx,input)` 决定。
- explicit build key 不被 alias 改写。
- tag 系统已删除，不提供替代 metadata extension。

## 验证矩阵

每波完成后根据影响面运行定向验证；最终运行完整验证。

### 基线与 stale scan

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit status --short
rg -n "\brequireTag\b|\.tag\b|\btag\.|createTagNamespace|FieldTag|TagNamespace|JsonTag|QueryTag|HeaderTag|UriTag|UrlencodedTag|MultipartTag|tagKind|getFieldTag|getFieldTags|field\.tags|encodeObjectByTag|decodeObjectByTag|mapTaggedObjectFields" /Users/munmunmiao/Documents/web/zen-kit/packages/core --glob '*.{ts,tsx,mts,cts}' || true
```

预期：实现完成后只剩明确的 negative type tests 或历史文档引用；生产源码不应残留旧 tag 语义。

### struct runtime/type

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core run test:type
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run packages/core/src/struct
```

覆盖：

- alias metadata 与 immutability。
- wire key 冲突。
- flat missing skip。
- nullable encode。
- missing/null policy 不变。
- public API 正负合同。
- phantom 收缩后的 `Infer`、request input/output、optionalOut。

### request builder / endpoint

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run packages/core/src/internal/request_builder.spec.ts packages/core/src/http packages/core/src/sse packages/core/src/web_socket
```

覆盖：

- default request build。
- explicit projection。
- whole-source bound value。
- path/query/headers/urlencoded/formData alias。
- body descriptor 统一。

### 完整 core

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core run typecheck
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core run test
```

只有实际运行并看到成功输出后，才能声明通过。

## 实施风险与缓解

### 风险 1：范围过大

缓解：严格按 wave 执行。每波必须能独立验证，不把 request 降高度、phantom 删除、codec walker 收敛混在同一 patch 里。

### 风险 2：breaking API 影响文档和类型测试

缓解：public API 收缩单独成 wave；先完成内部引用清零，再改 public exports 和文档。

### 风险 3：missing/null 语义被误改

缓解：先补表驱动测试，再合并 helper；helper 只能消除重复，不改变输出。

### 风险 4：request builder projection 边界误改

缓解：explicit object literal、scalar bound、whole-source bound、nested bound 分别测试。

### 风险 5：codec walker 收敛引入跨协议回归

缓解：先抽窄 helper，不做大一统 visitor；JSON、flat、request builder 保持各自 value policy，只共享字段投影和 branch selector。

## 成功标准

实现完成后应满足：

1. 生产源码没有旧 tag 语义。
2. alias/wire key 只有一个计算入口。
3. flat 缺失字段不再触发 child encode。
4. nullable primitive encode 不崩。
5. missing/null/zero-value 规则只有一个内部来源。
6. union/discriminatedUnion branch matching 不再散落在 codec 与 encode 两套实现中。
7. request body 内部表示统一。
8. public API 不再暴露内部 struct/request/body 建模类型。
9. struct runtime 不再 materialize `[TYPES]` phantom。
10. 定向和完整验证命令实际通过后，才能汇报完成。

## 自审记录

- Placeholder scan：本文不包含 TBD/TODO 占位。
- 一致性检查：breaking 策略明确为不保留 tag shim；与 alias-only 设计一致。
- 范围检查：content-codec/SSE/WebSocket JSON guessing 明确为非目标，避免与本轮 struct 极简修复混合。
- 歧义检查：explicit build key、whole-source bound value、normal parse/local key、wire key 冲突处理均已明确。

# struct alias-only 设计

日期：2026-06-19
状态：已确认设计方向，等待实现计划

## 背景

当前 struct 体系已经有两套明确的编排机制：

1. `struct.request({ path, query, headers, body })` 决定字段进入哪个 request section。
2. `defineRequest` / `defineEventStream` / `defineWebSocket` 的 `build(ctx, input)` 决定自定义 request 编排。

同时 body 编码方式已经由 wrapper 决定：

- `struct.json(struct)`
- `struct.urlencoded(shape)`
- `struct.formData(shape)`
- `struct.text()`
- `struct.blob()`
- `struct.arrayBuffer()`

因此字段上的 `tag.*(...)` 不应再承担 placement 暗示。真实仍然需要保留的是：TypeScript 字段名和 wire 字段名不一致时的名字映射。

本设计决定完整删除 `tag` 系统，改为 alias-only。

## 已确认决策

1. 完整删除公开 `tag` 概念。
2. 不再支持 struct 上的自定义 metadata 扩展。
3. 新增唯一字段别名 API：`struct.alias(name: string)`。
4. `alias` 只支持一个 name，不支持多 target alias。
5. `alias` 不决定字段 placement、exposure 或 codec。
6. 删除 `requireTag`，不引入 `requireAlias`。
7. 字段隐藏、private、omit、expose 等能力不属于本轮设计。

## 目标

### 1. 简化用户心智模型

最终模型应只有四条规则：

1. `struct.request` 决定字段进入 `path/query/headers/body`。
2. body wrapper 决定 body codec。
3. `build(ctx, input)` 中用户手写的对象 key 就是最终 wire key。
4. `alias(name)` 只把字段的本地名映射成一个 wire name。

### 2. 删除 Go-style tag 语义包袱

不再暴露：

- tag namespace
- tag config
- tag-based placement 暗示
- tag-based exposure/filter 暗示
- custom tag metadata adapter surface

### 3. 保持自动 request build 的 alias 能力

默认 request build 与 codec 编解码仍需要支持字段改名，例如：

```ts
const Input = struct.request({
  query: struct.object({
    includeProfile: struct.boolean().alias('include_profile'),
  }),
  headers: struct.object({
    traceId: struct.string().alias('x-trace-id'),
  }),
  body: struct.json(
    struct.object({
      displayName: struct.string().alias('display_name'),
    }),
  ),
})
```

## 非目标

本设计不做以下事情：

1. 不支持 `alias({ json, query, header, path })`。
2. 不支持 `alias.json(...)` / `alias.header(...)` / `alias.path(...)`。
3. 不支持 struct custom metadata。
4. 不保留 `createTagNamespace` / `tag.defineConfig` 替代品。
5. 不引入 drizzle-style `struct.string('display_name')` 构造器参数。
6. 不引入 `requireAlias`。
7. 不设计 omit/private/expose。
8. 不让 alias 自动决定 request section。
9. 不让 alias 自动改写 explicit build projection 的对象 key。

## 新 API

所有 struct 增加：

```ts
struct.alias(name: string): Struct
```

示例：

```ts
const User = struct.object({
  displayName: struct.string().alias('display_name'),
})
```

`alias` 与 `optional/null/nullish` 一样返回新 struct，不修改原 struct：

```ts
const base = struct.string()
const aliased = base.alias('display_name')

// base 没有 alias
// aliased 有 alias
```

### 类型行为

`alias` 不改变 input/output 类型。

```ts
const Name = struct.string().alias('display_name')

type Name = struct.Infer<typeof Name>
// string
```

对象字段类型仍使用 TypeScript 字段名：

```ts
const User = struct.object({
  displayName: struct.string().alias('display_name'),
})

type User = struct.Infer<typeof User>
// { displayName: string }
```

## wire key 规则

字段 wire key 只有一条规则：

```ts
wireKey = field.alias ?? fieldKey
```

无 alias 时使用 TypeScript 字段名。

```ts
const User = struct.object({
  name: struct.string(),
  displayName: struct.string().alias('display_name'),
})
```

JSON wire form：

```json
{
  "name": "Miao",
  "display_name": "Mun"
}
```

## request 行为

### request-shaped input

`struct.request` 决定 placement，alias 只决定当前 section 内的 key。

```ts
const Input = struct.request({
  path: struct.object({
    userId: struct.string().alias('user_id'),
  }),
  query: struct.object({
    includeProfile: struct.boolean().alias('include_profile'),
  }),
  headers: struct.object({
    traceId: struct.string().alias('x-trace-id'),
  }),
  body: struct.json(
    struct.object({
      displayName: struct.string().alias('display_name'),
    }),
  ),
})
```

对应 request：

```text
path param: user_id
query: include_profile=true
header: x-trace-id: ...
json body: { "display_name": ... }
```

### JSON body

JSON body 支持递归 alias：

```ts
const Profile = struct.object({
  displayName: struct.string().alias('display_name'),
})

const Input = struct.request({
  body: struct.json(
    struct.object({
      profile: Profile.alias('profile'),
    }),
  ),
})
```

wire body：

```json
{
  "profile": {
    "display_name": "Miao"
  }
}
```

递归 alias 应覆盖现有 JSON codec 支持的结构：

- object
- array
- tuple
- record value
- union
- discriminated union
- intersection

### flat sections

`path`、`query`、`headers`、`urlencoded`、`formData` 只读取字段的单个 alias。

```ts
struct.object({
  traceId: struct.string().alias('x-trace-id'),
})
```

在 headers section 中输出 `x-trace-id`。

同一个 struct 如果复用到多个 target，会使用同一个 alias。若不同 target 需要不同名字，应拆 struct 或在 `build` 中显式写 key。

## build 行为

### whole-source binding 应用 alias

如果 build 中把一个 bound source 整体绑定到目标，按 source struct 的 alias 编码。

```ts
build(ctx, input) {
  ctx.setJson(input.body)
}
```

若 `input.body` struct 中有 alias，则 JSON 输出使用 alias。

### explicit projection 不自动应用 alias

显式 projection 的对象 key 是用户写出的最终 wire key。

```ts
build(ctx, input) {
  ctx.setJson({
    name: input.body.displayName,
  })
}
```

输出：

```json
{ "name": "Miao" }
```

不会因为 `displayName` 字段有 `.alias('display_name')` 而输出 `display_name`。

原因：explicit build 是用户完整接管 request plan，object literal key 就是 wire contract。

## 删除清单

### 删除 struct API

删除：

```ts
struct.tag(...)
```

新增：

```ts
struct.alias(name: string)
```

### 删除 tag public API

删除以下导出：

```ts
tag
createTagNamespace
tagKind
JsonTag
QueryTag
UriTag
HeaderTag
UrlencodedTag
MultipartTag
```

删除以下类型：

```ts
FieldTag
MutableFieldTag
FieldTagOption
FieldTagContext
TagNamespace
TagScalar
```

删除以下 introspection API：

```ts
getFieldTag
getFieldTags
```

`getStructFields` 如保留，应不再返回 `tags` 字段。

建议改成：

```ts
interface StructField {
  readonly key: string
  readonly struct: StructLike<unknown, unknown, boolean>
  readonly alias?: string
}
```

也可以暂时不公开 alias introspection，只返回 `key` 与 `struct`。实现计划阶段再根据内部调用需要决定。

### 删除 requireTag

删除：

```ts
JsonCodecOptions.requireTag
```

不提供替代的 `requireAlias`。

旧的 tagged-only filtering 行为不迁移。

## 内部模型

struct definition 增加单个 alias 字段：

```ts
alias?: string
```

`alias(name)` 创建新 struct：

```ts
makeStruct({
  ...definition,
  alias: name,
})
```

字段遍历时获取 wire key：

```ts
function getWireKey(fieldKey: string, fieldStruct: RuntimeStruct): string {
  return fieldStruct[DEFINITION].alias ?? fieldKey
}
```

或者在 `getStructFields` 中 materialize：

```ts
{
  key,
  struct,
  alias: fieldDefinition.alias,
}
```

## 迁移示例

### JSON

旧：

```ts
displayName: struct.string().tag(tag.json('display_name'))
```

新：

```ts
displayName: struct.string().alias('display_name')
```

### headers

旧：

```ts
traceId: struct.string().tag(tag.header('x-trace-id'))
```

新：

```ts
traceId: struct.string().alias('x-trace-id')
```

### path / uri

旧：

```ts
userId: struct.string().tag(tag.uri('user_id'))
```

新：

```ts
userId: struct.string().alias('user_id')
```

### custom metadata

旧：

```ts
const DbTag = createTagNamespace('db')
const db = tag.defineConfig(DbTag)

id: struct.number().tag(db('column', 'user_id'), db('primaryKey'))
```

新：无替代。该能力从 core 删除。

如未来需要 ORM/struct metadata，应在独立 package 或独立 API 中重新设计，不复用 core struct alias。

## 测试改造范围

### 新增或改写 alias 测试

需要覆盖：

1. `.alias(name)` 不改变类型推断。
2. `.alias(name)` immutable chaining。
3. object JSON encode/decode 使用 alias。
4. 无 alias 字段 fallback 字段名。
5. nested JSON object/array/tuple/record/union/discriminatedUnion/intersection 递归 alias。
6. `struct.request` 的 path/query/headers/body 使用 alias。
7. urlencoded/formData 使用 alias。
8. explicit build projection 不自动应用来源字段 alias。
9. whole-source binding 应用 alias。
10. SSE/WebSocket JSON decode/encode 使用 alias。

### 删除 tag 测试

删除或重写：

1. `tag.spec.ts`
2. custom namespace/config 测试
3. `getFieldTag/getFieldTags` 测试
4. `tagKind` 测试
5. `tag.query/header/uri` 显式命名测试
6. `requireTag` 测试
7. XML removed tag surface 相关 type test

### 更新 public API type tests

需要确认以下 API 不再可从 public entry 导入：

```ts
tag
createTagNamespace
getFieldTag
getFieldTags
FieldTag
TagNamespace
```

同时确认新 API 可用：

```ts
struct.string().alias('wire_name')
```

## 文档改造范围

需要更新：

1. `packages/core/src/struct/README.md`
2. `doc/core/struct.md`
3. `packages/core/design.md`
4. 与 tag/requireTag 相关的 docs/superpowers 计划或分析文档
5. 示例代码中所有 `.tag(tag.*(...))`

文档应删除 “Tag System” 作为当前 API 的章节，改为 “Alias”。

建议主文案：

> `alias(name)` maps a TypeScript field name to one wire field name. It does not control request placement, field exposure, or codec selection.

中文解释：

> `alias(name)` 只把 TypeScript 字段名映射为一个 wire 字段名。它不决定字段位置、不决定字段是否暴露、不决定编码格式。

## 风险

### Breaking change

这是破坏性 API 改动。所有使用 `.tag(...)`、`tag.*(...)`、custom tag metadata、tag introspection 的代码都会受到影响。

本设计接受该破坏性变化。

### custom metadata 能力删除

core 不再支持 struct 字段挂任意 metadata。

这是有意删除，不提供兼容替代。

### 多 target 不同别名能力删除

同一个 struct 字段不能在 JSON/header/query/path 中声明不同别名。

如有需求，使用以下方式之一：

1. 拆分 struct。
2. 在 `build` 中显式写不同 wire key。

### requireTag 行为删除

原 tagged-only filter 行为删除。

如有字段隐藏需求，未来单独设计 omit/private/expose，不属于本轮。

## 成功标准

实现完成后，应满足：

1. public API 不再导出 tag 系统。
2. struct 不再有 `.tag(...)`。
3. struct 有 `.alias(name: string)`。
4. 所有自动 codec/request builder 路径使用 alias 或 fallback 字段名。
5. explicit build projection 的 object key 不被 alias 自动改写。
6. `requireTag` 被删除。
7. 文档中不再把 tag 作为当前用户 API。
8. 测试覆盖 alias-only 行为和删除后的 public API 边界。

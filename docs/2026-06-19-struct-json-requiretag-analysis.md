# struct.json 与 requireTag 语义冲突分析背景

> Historical note: this document analyzes the pre-alias struct tag system. The accepted redesign removes `tag.*(...)`, `.tag(...)`, custom tag metadata, and `requireTag`; current field wire names use `struct.alias(name)`.

本文整理 `struct.json(...)`、`tag.json(...)` 和 `requireTag` 之间的设计冲突，供后续做更深入的 API 与 runtime 边界分析。

## 结论摘要

当前代码里，`requireTag` 的实际语义是“只处理带当前 tag namespace 的字段”。对 JSON codec 来说，开启 `{ requireTag: true }` 后，只有显式写了 `tag.json(...)` 的字段才会被 encode/decode；未打 `tag.json(...)` 的字段会被跳过。

这个语义已经超出 Go struct tag 风格的 alias model。按照当前 README 和 `struct.request({ body: struct.json(...) })` 的设计，`struct.json(...)` 应该决定 body codec 和 request section；`tag.json(...)` 应该只负责字段在 JSON wire form 中的别名。未写 `tag.json(...)` 的字段应默认使用 TypeScript 字段名，而不应被视为“不属于 JSON”。

因此，`requireTag` 在当前 `struct.json(...)` 设计下是应删除的语义开关，建议作为架构分析重点，而不是继续默认扩展它的使用面。

## 背景

项目现在同时存在两套语义线索：

1. `struct.json(struct)` 表达 JSON request body wrapper。
2. `tag.json(name)` 表达字段在 JSON wire form 中的 key alias。
3. `requireTag` 表达“必须存在当前 namespace tag 才参与编解码”。

前两者可以自然组成 Go style mental model：

```ts
const Input = struct.request({
  body: struct.json(
    struct.object({
      name: struct.string(),
      displayName: struct.string().tag(tag.json('display_name')),
    }),
  ),
})
```

在这个模型下：

```ts
{ name: 'Miao', display_name: 'Mun' }
```

是合理 wire form。`name` 没有 alias，所以直接使用字段名；`displayName` 有 alias，所以使用 `display_name`。

但 `requireTag` 引入了另一套语义：没有 `tag.json(...)` 的字段不是“使用默认字段名”，而是“不参与 JSON codec”。这会让 `tag.json` 兼具 alias 和 exposure marker 两种角色。

## 当前代码证据

### README 语义

`packages/core/src/struct/README.md` 明确把 `tag` 对齐 Go struct tag：

- `tag` 是字段上的外部表示声明。
- 它类似 Go 的 `json:"user_name"`、`query:"include_profile"` 或 `header:"x-trace-id"`。
- 它只改名，不改变 TypeScript 字段名。
- 它不决定字段属于哪个 request section。

同一段文档还说明：

- JSON request body 由 `struct.json(...)` 表达。
- query、headers、path、urlencoded、FormData 分别由对应 tag 表达 wire key。
- `path`、`query`、`headers` 只接受 flat object。
- body codec 由 `struct.json(...)`、`struct.urlencoded(...)`、`struct.formData(...)` 等 wrapper 决定。

这说明当前公开叙述已经把“字段属于哪里”和“字段叫什么名字”分开了。

### struct.json 的 runtime 表达

`packages/core/src/struct/constructors.ts` 中，`createJsonBodyStruct(struct)` 只是调用 `createRequestBodyStruct('json', struct)`。`requestBody` definition 保存的是：

- `kind: 'requestBody'`
- `codec: 'json'`
- `struct`

也就是说，`struct.json(...)` 已经是一个明确的 codec wrapper。字段是否属于 JSON body，应由这个 wrapper 和 request shape 决定，而不需要再由 `tag.json(...)` 的存在性决定。

### request builder 的默认 JSON encode 路径

`packages/core/src/internal/request_builder.ts` 的默认 request shape 构建路径中：

- `definition.body` 经过 `resolveRequestBody(...)` 得到 body codec。
- 当 `body.codec === 'json'` 时，调用 `setJsonBody(state, encodeKeyedValue(body.struct, bodyValue))`。
- `encodeKeyedValue(...)` 调用 `mapTaggedObjectFields(..., JsonTag, ...)`，没有传 `requireTag`。

因此生产路径默认语义是：JSON body 内对象字段会按 `tag.json(...)` 改名；没有 `tag.json(...)` 时使用字段原名。

这与 Go style alias model 一致。

### response decode 路径

`packages/core/src/http/http.ts` 中，JSON response 解析走：

```ts
return decodeJson(struct, body)
```

这里也没有传 `{ requireTag: true }`。也就是说 response 生产路径同样不依赖 `requireTag`。

### requireTag 的实际行为

`packages/core/src/struct/codec/json.ts` 暴露了：

```ts
export interface JsonCodecOptions {
  requireTag?: boolean
}
```

`packages/core/src/struct/codec/common.ts` 中，encode 和 decode 两边都存在相同过滤逻辑：

```ts
if (options.requireTag && !fieldTag) {
  continue
}
```

这不是 alias 语义，而是字段过滤语义。

对应测试集中也明确覆盖了该行为：

```ts
const query = struct.object({
  internal: struct.string(),
  pageSize: struct.number().tag(tag.json('page_size')),
})

expect(decodeJson(query, { internal: 'ignored', page_size: 20 }, { requireTag: true })).toEqual({
  internal: '',
  pageSize: 20,
})
```

这个结果说明：

- `internal` 在 wire input 中存在。
- 因为 struct field 没有 `tag.json(...)`，decode 阶段忽略它。
- parse 缺失字段后用默认值 `''` 补齐。

这和“没有 alias 就使用字段名”的 Go style model 冲突。

## 问题成因

初步看，这个冲突来自 API 演化过程中两种设计目标的重叠。

早期如果没有 `struct.request({ body: struct.json(...) })` 这样的 section/body wrapper，`tag.json(...)` 可能被临时用来表达“这个字段需要进入 JSON wire form”。在这种模型里，`requireTag` 可以作为显式白名单：只要没打 tag，就不暴露到 wire 层。

但在现在的设计里，字段属于哪个 request section 已经由结构表达：

- `path` section 属于 URL path params。
- `query` section 属于 query params。
- `headers` section 属于 headers。
- `body: struct.json(...)` 属于 JSON body。
- `body: struct.urlencoded(...)` 属于 form urlencoded body。
- `body: struct.formData(...)` 属于 multipart FormData body。

因此，`tag.*(...)` 不再需要承担 exposure marker 的职责。它只需要做 wire key alias。

`requireTag` 没有被生产路径使用，但还留在 `JsonCodecOptions` 和测试中，于是形成了一个公开但语义摇摆的选项。

## 主要风险

### 1. API 心智模型不一致

README 说 `tag` 只改名；`requireTag` 却让 `tag` 变成字段是否参与 JSON 编解码的条件。

用户会很难判断：

- 不写 `tag.json(...)` 是不是合法？
- JSON body 中字段默认 key 是不是 TypeScript 字段名？
- `tag.json(...)` 是 alias，还是 exposure marker？

### 2. 内部字段泄漏问题被放错层

如果确实需要“内部字段不进 JSON body”，用 `requireTag` 解决会把责任放在 alias 系统上。更清晰的方式应该是：

- 在 body struct 里不要包含内部字段。
- 或提供明确的 omit/private/expose 机制。
- 或在 DTO/struct 层拆分 domain model 和 wire model。

让 `tag.json(...)` 同时表示 alias 和 exposure，会让 struct 的语义变得隐式。

### 3. decode 默认值可能掩盖输入差异

开启 `requireTag` 后，wire input 里存在但 struct 未打 tag 的字段会被忽略。对于 required string/number/boolean 等字段，后续 parse 可能构造 zero value。

这会造成一种不明显的行为：input 明明给了字段，但因为没写 tag，结果变成默认值。这个行为不适合作为普通 alias 系统的一部分。

### 4. public option 扩散后更难删除

`JsonCodecOptions.requireTag` 目前在非测试代码中没有实际调用点。如果继续保留并对外宣传，后续会更难判断是否有用户依赖它。

如果它只是历史开关，现在是最容易收敛的时候。

## 待深度分析的问题

1. `requireTag` 是否应该从 public `JsonCodecOptions` 删除？
2. 如果删除，是否只移除 JSON codec 层，还是也需要检查 shared `codec/common.ts` 对其它 namespace 的潜在复用？
3. 当前测试中所有 `requireTag` 用例，哪些是在验证真实需求，哪些只是验证历史行为？
4. 如果真实需求是“字段不暴露到 wire 层”，应该由哪种 API 表达？
5. `tag.json('-')` 是否应该支持 Go style omit？如果支持，它和 optional/undefined/zero value 的关系是什么？
6. 是否需要区分 encode omit 和 decode ignore？例如只禁止输出，但允许读入；或反过来。
7. 对 `struct.urlencoded(...)`、`struct.formData(...)`、query/header/path 等 flat codec，是否也应保持同样的 alias-only 语义？
8. 如果某些 flat section 需要显式 tag，是否应该由 section 构造器或 flat codec 规则表达，而不是复用 `requireTag`？

## 可选方向

### 方向 A：删除 requireTag，统一 alias-only 语义

这是最符合当前 README 和 request wrapper 设计的方向。

行为：

- `tag.json(...)` 只负责 rename。
- 无 tag 字段默认使用字段名。
- `struct.json(...)` 决定 JSON body codec。
- 删除 `JsonCodecOptions.requireTag`。
- 删除或重写 requireTag 相关测试。

优点：

- 心智模型最简单。
- 和 Go struct tag 风格一致。
- 和当前生产路径一致。

缺点：

- 如果已有外部用户直接调用 `encodeJson/decodeJson(..., { requireTag: true })`，会破坏兼容。
- 需要决定是否做 breaking change、deprecation 或先标记 internal。

### 方向 B：删除 requireTag，以独立内部过滤能力重设需求

如果确实需要显式字段白名单，可以把它从 JSON alias 语义中剥离出来。

可能命名：

- `taggedOnly`
- `explicitFieldsOnly`
- `wireTaggedOnly`

同时文档必须明确：它不是 Go style alias 行为，而是过滤策略。

优点：

- 保留现有能力。
- 对已依赖该选项的用户更温和。

缺点：

- API 仍然多一层复杂度。
- 需要解释为什么 JSON codec 既有 alias，又有 tagged-only filter。
- 容易继续鼓励把 domain model 和 wire model 混在一个 struct 里。

### 方向 C：用明确 omit/private API 替代 requireTag

如果需求是“不让某字段进入 wire form”，可以设计专门能力。

可能形式：

```ts
password: struct.string().tag(tag.json('-'))
internal: struct.string().private()
internal: struct.string().omit('json')
```

优点：

- 表达更直接。
- 不会把“没写 alias”和“不暴露”混在一起。
- 可以分别定义 encode/decode 行为。

缺点：

- 需要额外 API 设计。
- 要分析和 parse zero value、optional、unknown keys 的关系。

## 初步建议

建议把默认目标定为方向 A：删除 `requireTag`，让 `tag.json(...)` 回到 alias-only 语义。

如果后续分析确认存在“同一个 struct 里部分字段不进 JSON wire”的真实需求，再单独设计方向 C 的 omit/private 机制，而不是继续让 `tag.json(...)` 的存在性承担过滤语义。

在做代码修改前，建议 reviewer 重点确认：

1. 公开 API 是否已经发布并被用户依赖。
2. `encodeJson/decodeJson` 是否被视为 public API，还是仅供内部 request/response runtime 使用。
3. 是否需要先 deprecate `requireTag`，还是可以直接删除。
4. 是否需要新增文档明确“无 tag 字段默认使用字段名”。
5. 是否需要新增测试覆盖 `struct.json(...)` body 中无 `tag.json(...)` 字段的 encode/decode 行为。

## 相关文件

- `packages/core/src/struct/README.md`
- `packages/core/src/struct/constructors.ts`
- `packages/core/src/struct/codec/json.ts`
- `packages/core/src/struct/codec/common.ts`
- `packages/core/src/struct/codec/json.spec.ts`
- `packages/core/src/internal/request_builder.ts`
- `packages/core/src/http/http.ts`

# Struct Tag 开发说明

> 当前状态：tag metadata 历史实施指南。2026-05-18 后，endpoint 默认请求构建以 `struct.request({ path, query, headers, body })` 为准；字段 `tag.*` 不再承担 request placement。本文中 tag codec 的实现细节可继续参考，request builder 相关 checklist 已按 request-shaped struct 收口。

## 一、目标

基于 `Struct Tag 设计与应用` 落地一套可实现、可测试、可扩展的 struct tag 机制。

目标 API：

```ts
import { struct, tag } from '@defjs/struct'
import { gorm } from '@defjs/gorm/tag'

const input = struct.object({
  id: struct.number().tag(
    tag.json('id'),
    tag.uri('id'),
    gorm('column', 'id'),
    gorm('primaryKey'),
  ),
  name: struct.string().tag(
    tag.json('user_name'),
    tag.urlencoded('user_name'),
    gorm('column', 'user_name'),
    gorm('notNull'),
  ),
})
```

非目标：

- core 不枚举 GORM / Bun / ORM 配置项。
- core 不把 Go 的 `gorm:"column:id;primaryKey"` 字符串格式当作内部模型。
- core 不自动把未标记字段塞进 URL、header 或 body。
- core 不保留第二套 JSON 字段名入口。

---

## 二、推荐文件结构

实现入口应落在 `packages/core/src/struct`，旧字段建模入口不再作为 public API 暴露。

推荐目标结构：

```text
packages/core/src/struct/
  facade.ts
  index.ts
  public_api.ts
  struct.ts
  tag.ts
  codec/
    json.ts
    multipart.ts
    query.ts
    urlencoded.ts
    xml.ts
  __tests__ 或 *.spec.ts
```

请求构建相关改动：

```text
packages/core/src/internal/
  request_builder.ts
  endpoint_input.ts
  request_values.ts
```

导出入口：

```text
packages/core/src/public_api.ts
packages/core/src/index.ts
```

要求：

- 新 public API 使用 `struct`。
- 新 tag helper 全部挂在 `tag` namespace 下。
- 新实现不要导出旧包名入口。

---

## 三、核心类型

### 3.1 Tag 标量

```ts
type TagScalar = string | number | boolean
```

不要允许 object 直接作为 tag config value。复杂配置应由 adapter 自己定义更高层 helper，然后降级成稳定的 scalar config。

### 3.2 Tag namespace

```ts
interface TagNamespace<TName extends string = string> {
  readonly kind: symbol
  readonly name: TName
}
```

约束：

- `kind` 是 Map key，必须来自 core 或 adapter 导出的唯一 `Symbol()`。
- `name` 只用于 debug、错误信息、文档导出。
- 默认不使用 `Symbol.for()`。

### 3.3 Field tag

```ts
interface FieldTag<TName extends string = string> {
  readonly namespace: TagNamespace<TName>
  readonly value: TagScalar | undefined
  readonly config: ReadonlyMap<string, TagScalar>
}

interface MutableFieldTag<TName extends string = string> {
  namespace: TagNamespace<TName>
  value: TagScalar | undefined
  config: Map<string, TagScalar>
}
```

规则：

- value tag 写入 `value`。
- config tag 写入 `config`。
- 同一 namespace 同一 config key 后写覆盖前写。
- 同一 namespace 的 value 后写覆盖前写。

### 3.4 FieldTagOption

```ts
interface FieldTagContext {
  readonly fieldKey: string
  readonly tags: Map<symbol, MutableFieldTag>
}

type FieldTagOption = (context: FieldTagContext) => void
```

`fieldKey` 必须在 context 里，因为 `tag.json()`、`tag.urlencoded()`、`tag.multipart()` 无参时需要回落到字段名。

---

## 四、核心伪代码

### 4.1 namespace 定义

```ts
function createTagNamespace<const TName extends string>(name: TName): TagNamespace<TName> {
  return Object.freeze({
    kind: Symbol(`defjs.struct.tag.${name}`),
    name,
  })
}

const JsonTag = createTagNamespace('json')
const XmlTag = createTagNamespace('xml')
const QueryTag = createTagNamespace('query')
const UriTag = createTagNamespace('uri')
const HeaderTag = createTagNamespace('header')
const UrlencodedTag = createTagNamespace('urlencoded')
const MultipartTag = createTagNamespace('multipart')

const tagKind = Object.freeze({
  header: HeaderTag.kind,
  json: JsonTag.kind,
  multipart: MultipartTag.kind,
  query: QueryTag.kind,
  uri: UriTag.kind,
  urlencoded: UrlencodedTag.kind,
  xml: XmlTag.kind,
})
```

### 4.2 ensureTag

```ts
function ensureTag(
  tags: Map<symbol, MutableFieldTag>,
  namespace: TagNamespace,
): MutableFieldTag {
  const existing = tags.get(namespace.kind)

  if (existing) {
    return existing
  }

  const created: MutableFieldTag = {
    namespace,
    value: undefined,
    config: new Map(),
  }

  tags.set(namespace.kind, created)
  return created
}
```

### 4.3 value helper

```ts
function defineValueTag(
  namespace: TagNamespace,
  options: { requireExplicitName?: boolean } = {},
): (fieldName?: string) => FieldTagOption {
  return fieldName => context => {
    if (options.requireExplicitName && typeof fieldName !== 'string') {
      throw new Error(`tag.${namespace.name}() requires an explicit field name`)
    }

    const fieldTag = ensureTag(context.tags, namespace)
    fieldTag.value = fieldName ?? context.fieldKey
  }
}
```

内置 helper：

```ts
const tag = Object.freeze({
  header: defineValueTag(HeaderTag, { requireExplicitName: true }),
  json: defineValueTag(JsonTag),
  multipart: defineValueTag(MultipartTag),
  query: defineValueTag(QueryTag, { requireExplicitName: true }),
  uri: defineValueTag(UriTag, { requireExplicitName: true }),
  urlencoded: defineValueTag(UrlencodedTag),
  xml: defineValueTag(XmlTag),
  kind: tagKind,
  defineConfig,
})
```

### 4.4 config helper

```ts
function defineConfig(namespace: TagNamespace) {
  return (key: string, value: TagScalar = true): FieldTagOption =>
    context => {
      assertConfigKey(key, namespace)

      const fieldTag = ensureTag(context.tags, namespace)
      fieldTag.config.set(key, value)
    }
}

function assertConfigKey(key: string, namespace: TagNamespace): void {
  if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(key)) {
    throw new Error(`invalid ${namespace.name} tag config key: ${key}`)
  }
}
```

adapter 示例：

```ts
const GormTag = Object.freeze({
  kind: Symbol('defjs.gorm.tag'),
  name: 'gorm',
} satisfies TagNamespace<'gorm'>)

const gorm = tag.defineConfig(GormTag)
```

### 4.5 struct field 挂 tag

struct 字段对象应保持链式不可变语义。`.tag()` 不直接改原对象，而是 clone definition。

```ts
interface StructDefinition {
  readonly tagOptions: readonly FieldTagOption[]
}

function withTagOptions<T extends StructLike>(
  field: T,
  options: readonly FieldTagOption[],
): T {
  return cloneStruct(field, definition => ({
    ...definition,
    tagOptions: [...definition.tagOptions, ...options],
  }))
}

function tagMethod(...options: FieldTagOption[]): StructLike {
  return withTagOptions(this, options)
}
```

### 4.6 object shape 绑定 fieldKey

无参 value tag 需要 object shape 的 key，所以 metadata 不能只在 primitive field 创建时定死。

```ts
function materializeFieldTags(fieldKey: string, field: StructLike): ReadonlyMap<symbol, FieldTag> {
  const mutableTags = new Map<symbol, MutableFieldTag>()

  for (const option of getDefinition(field).tagOptions) {
    option({
      fieldKey,
      tags: mutableTags,
    })
  }

  return freezeFieldTags(mutableTags)
}
```

### 4.7 freezeFieldTags

```ts
function freezeFieldTags(tags: Map<symbol, MutableFieldTag>): ReadonlyMap<symbol, FieldTag> {
  const result = new Map<symbol, FieldTag>()

  for (const [kind, tag] of tags) {
    result.set(kind, Object.freeze({
      namespace: tag.namespace,
      value: tag.value,
      config: new Map(tag.config),
    }))
  }

  return result
}
```

### 4.8 metadata 读取

```ts
function getFieldTags(field: StructLike, fieldKey?: string): ReadonlyMap<symbol, FieldTag> {
  const key = fieldKey ?? getBoundFieldKey(field)

  if (!key) {
    throw new Error('field key is required to materialize tags')
  }

  return materializeFieldTags(key, field)
}

function getFieldTag(field: StructLike, kind: symbol, fieldKey?: string): FieldTag | undefined {
  return getFieldTags(field, fieldKey).get(kind)
}
```

### 4.9 object field metadata

object struct 可以在创建时绑定每个 field 的 key，缓存只读 metadata。

```ts
function createObjectStruct(shape: Record<string, StructLike>): ObjectStruct {
  const fields = new Map<string, ObjectField>()

  for (const [fieldKey, field] of Object.entries(shape)) {
    fields.set(fieldKey, {
      key: fieldKey,
      struct: field,
      tags: materializeFieldTags(fieldKey, field),
    })
  }

  return createObjectStructFromFields(fields)
}
```

---

## 五、codec 伪代码

### 5.1 encode object by value tag

```ts
function encodeObjectByTag(
  objectStruct: ObjectStruct,
  value: Record<string, unknown>,
  namespace: TagNamespace,
): Record<string, unknown> {
  const output: Record<string, unknown> = {}

  for (const field of objectStruct.fields.values()) {
    const tag = field.tags.get(namespace.kind)
    const wireKey = typeof tag?.value === 'string' ? tag.value : field.key
    const fieldValue = value[field.key]

    if (typeof fieldValue === 'undefined') {
      continue
    }

    output[wireKey] = encodeField(field.struct, fieldValue)
  }

  return output
}
```

### 5.2 decode object by value tag

```ts
function decodeObjectByTag(
  objectStruct: ObjectStruct,
  wireValue: Record<string, unknown>,
  namespace: TagNamespace,
): Record<string, unknown> {
  const output: Record<string, unknown> = {}

  for (const field of objectStruct.fields.values()) {
    const tag = field.tags.get(namespace.kind)
    const wireKey = typeof tag?.value === 'string' ? tag.value : field.key

    if (!(wireKey in wireValue)) {
      continue
    }

    output[field.key] = decodeField(field.struct, wireValue[wireKey])
  }

  return output
}
```

### 5.3 JSON internal codec

```ts
function internalJsonEncode(struct: StructLike, value: unknown): unknown {
  if (isObjectStruct(struct)) {
    return encodeObjectByTag(struct, value as Record<string, unknown>, JsonTag)
  }

  return encodeField(struct, value)
}

function internalJsonDecode(struct: StructLike, value: unknown): unknown {
  if (isObjectStruct(struct)) {
    assertPlainObject(value, 'json decode expects object')
    return decodeObjectByTag(struct, value as Record<string, unknown>, JsonTag)
  }

  return decodeField(struct, value)
}
```

### 5.4 URL encoded body

```ts
function encodeUrlencoded(
  objectStruct: ObjectStruct,
  value: Record<string, unknown>,
  options?: UrlencodedSerializerOptions,
): URLSearchParams {
  const params = new URLSearchParams()

  for (const field of objectStruct.fields.values()) {
    const tag = field.tags.get(UrlencodedTag.kind)
    if (!tag) {
      continue
    }

    const key = String(tag.value ?? field.key)
    const encoded = encodeField(field.struct, value[field.key])

    appendSearchParam(params, key, encoded, options)
  }

  return params
}

function appendSearchParam(
  params: URLSearchParams,
  key: string,
  value: unknown,
  options?: UrlencodedSerializerOptions,
): void {
  if (typeof value === 'undefined') {
    return
  }

  if (isScalarLike(value)) {
    params.set(key, stringifyScalar(value))
    return
  }

  if (options?.serializeComplexValue) {
    options.serializeComplexValue(params, key, value)
    return
  }

  throw new Error(`urlencoded value for "${key}" requires explicit serializer`)
}
```

### 5.5 Multipart body

```ts
function encodeMultipart(objectStruct: ObjectStruct, value: Record<string, unknown>): FormData {
  const form = new FormData()

  for (const field of objectStruct.fields.values()) {
    const tag = field.tags.get(MultipartTag.kind)
    if (!tag) {
      continue
    }

    const key = String(tag.value ?? field.key)
    const encoded = encodeField(field.struct, value[field.key])
    appendFormData(form, key, encoded)
  }

  return form
}

function appendFormData(form: FormData, key: string, value: unknown): void {
  if (typeof value === 'undefined') {
    return
  }

  if (isBlobLike(value)) {
    form.append(key, value)
    return
  }

  if (isScalarLike(value)) {
    form.append(key, stringifyScalar(value))
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendFormData(form, key, item)
    }
    return
  }

  throw new Error(`multipart value for "${key}" is not supported`)
}
```

### 5.6 Query

```ts
function encodeQuery(
  objectStruct: ObjectStruct,
  value: Record<string, unknown>,
  options?: QuerySerializerOptions,
): URLSearchParams | string {
  const record: Record<string, unknown> = {}

  for (const field of objectStruct.fields.values()) {
    const tag = field.tags.get(QueryTag.kind)
    if (!tag) {
      continue
    }

    const key = String(tag.value)
    record[key] = encodeField(field.struct, value[field.key])
  }

  if (options?.queryParamsSerializer) {
    return options.queryParamsSerializer(record)
  }

  const params = new URLSearchParams()

  for (const [key, item] of Object.entries(record)) {
    if (typeof item === 'undefined') {
      continue
    }

    if (!isScalarLike(item)) {
      throw new Error(`query value for "${key}" requires queryParamsSerializer`)
    }

    params.set(key, stringifyScalar(item))
  }

  return params
}
```

---

## 六、request builder 伪代码

### 6.1 自动构建入口

```ts
function buildRequestFromStruct<TInput>(
  inputStruct: ObjectStruct,
  input: TInput,
  options: AutoBuildOptions,
): RequestBuild {
  const parsed = struct.validate(inputStruct, input)
  const request = createEmptyRequestBuild()

  request.params = encodePathParams(inputStruct, parsed)
  request.query = encodeQuery(inputStruct, parsed, options.query)
  request.headers = encodeHeaders(inputStruct, parsed)
  request.body = encodeRequestBody(inputStruct, parsed, options.body)

  return request
}
```

### 6.2 body codec 选择

```ts
function encodeRequestBody(
  inputStruct: ObjectStruct,
  input: Record<string, unknown>,
  options: BodyOptions | undefined,
): RequestBody | undefined {
  switch (options?.codec) {
    case 'json':
      return JSON.stringify(internalJsonEncode(inputStruct, input))
    case 'urlencoded':
      return encodeUrlencoded(inputStruct, input, options)
    case 'multipart':
      return encodeMultipart(inputStruct, input)
    case 'xml':
      return encodeXml(inputStruct, input, options)
    case undefined:
      return undefined
  }
}
```

不要根据字段上存在某个 body tag 自动猜 body codec。body codec 必须来自 request definition 或显式配置。

---

## 七、开发 TodoList

### Phase 0: 准备

- [ ] 确认新 public API 名称为 `struct`。
- [ ] 列出所有当前导入旧包名的文件。
- [ ] 决定迁移是一次性改名，还是先在 feature branch 中分阶段提交。
- [ ] 确认测试命令在本机可运行。

### Phase 1: struct 模块迁移

- [ ] 新建 `packages/core/src/struct/`。
- [ ] 将当前字段定义、object、parse、encode 逻辑迁移到 `struct`。
- [ ] 新建 `packages/core/src/struct/facade.ts`，导出 `struct` facade。
- [ ] 更新 `packages/core/src/public_api.ts`，导出 `./struct`。
- [ ] 移除新 public API 中旧包名导出。
- [ ] 更新内部 import。
- [ ] 更新测试 import。

### Phase 2: tag metadata

- [ ] 新建 `packages/core/src/struct/tag.ts`。
- [ ] 实现 `TagScalar`、`TagNamespace`、`FieldTag`、`FieldTagOption`。
- [ ] 实现内置 namespace：json、xml、query、uri、header、urlencoded、multipart。
- [ ] 实现 `tag.kind`。
- [ ] 实现 `defineValueTag()`。
- [ ] 实现 `defineConfig()`。
- [ ] 实现 `.tag(...options)` 链式方法。
- [ ] 确保 `.tag()` clone 当前 struct，不修改原对象。
- [ ] 在 object shape 创建时绑定 `fieldKey` 并 materialize tags。
- [ ] 实现 `getFieldTags()` 和 `getFieldTag()`。

### Phase 3: 覆盖规则

- [ ] value tag 后写覆盖前写。
- [ ] config tag 同 namespace 同 key 后写覆盖前写。
- [ ] config flag 默认值为 `true`。
- [ ] `false` 可以覆盖之前的 `true`。
- [ ] 不对重复 key 抛错。

### Phase 4: internal codec encode/decode

- [ ] 实现内部 JSON encode/decode helper。
- [ ] 实现内部 urlencoded encode/decode helper。
- [ ] 实现内部 multipart encode/decode helper。
- [ ] 为 XML 先实现字段名 metadata 读取；复杂 XML 配置留给后续 adapter。
- [ ] 默认 query/urlencoded serializer 遇到复杂值时抛错。
- [ ] query 支持 `queryParamsSerializer`。

### Phase 5: request-shaped builder 接入

- [ ] 增加 `struct.request({ path, query, headers, body })` root。
- [ ] 默认请求构建只接受 `struct.request(...)` root。
- [ ] 自动构建 path params 时读取 `request.path` section。
- [ ] 自动构建 query 时读取 `request.query` section。
- [ ] 自动构建 headers 时读取 `request.headers` section。
- [ ] 自动构建 body 时读取 `request.body` wrapper。
- [ ] body codec 由 `struct.json(...)`、`struct.urlencoded(...)`、`struct.formData(...)`、`struct.text()`、`struct.blob()`、`struct.arrayBuffer()` 决定。
- [ ] section-local wire key 由 `tag.*(...)` 决定。
- [ ] 保留显式 `build` 的优先级。
- [ ] 不把 internal object 当 wire object decode。

### Phase 6: 文档与示例

- [ ] README 示例统一使用 `struct`。
- [ ] 示例统一使用 `tag.*` helper。
- [ ] 删除旧字段名入口文档。
- [ ] 补 ORM adapter 示例。
- [ ] 补 query serializer 示例。
- [ ] 补 multipart upload 示例。
- [ ] 补 urlencoded login form 示例。

### Phase 7: 单元测试

- [ ] 为 `tag.ts` 增加 namespace、value tag、config tag 单元测试。
- [ ] 为 `.tag(...options)` 增加不可变链式测试。
- [ ] 为 object shape 绑定 `fieldKey` 增加单元测试。
- [ ] 为 metadata 读取增加 `getFieldTags()` / `getFieldTag()` 单元测试。
- [ ] 为 JSON codec 增加 encode/decode 单元测试。
- [ ] 为 urlencoded codec 增加 `URLSearchParams` 和复杂值抛错单元测试。
- [ ] 为 multipart codec 增加 `FormData`、scalar、Blob/File、数组和不支持对象单元测试。
- [ ] 为 query codec 增加默认 `URLSearchParams`、复杂值抛错、`queryParamsSerializer` 单元测试。
- [ ] 为 request builder 自动构建增加 path/query/header/body 单元测试。
- [ ] 为类型约束增加 `*.type.test.ts`。

### Phase 8: HTTP 构建单元测试

- [ ] 增加 struct tag 到 request builder 的单元用例。
- [ ] 增加 JSON body 单元用例。
- [ ] 增加 urlencoded body 单元用例。
- [ ] 增加 multipart body 单元用例。
- [ ] 增加 query/path/header 同时构建的单元用例。
- [ ] 增加显式 `build` 覆盖自动构建的单元用例。
- [ ] 增加 `queryParamsSerializer` 接收复杂 query raw params 的单元用例。

---

## 八、测试 Checklist

### 8.1 单元测试文件建议

推荐新增或重命名为：

```text
packages/core/src/struct/tag.spec.ts
packages/core/src/struct/tag.type.test.ts
packages/core/src/struct/struct.tag.spec.ts
packages/core/src/struct/codec/json.spec.ts
packages/core/src/struct/codec/urlencoded.spec.ts
packages/core/src/struct/codec/multipart.spec.ts
packages/core/src/struct/codec/query.spec.ts
packages/core/src/internal/request_builder.struct.spec.ts
```

### 8.2 Public API

- [ ] `struct.object()`、`struct.string()`、`struct.number()` 等 facade 可用。
- [ ] `tag.json()`、`tag.xml()`、`tag.query()`、`tag.uri()`、`tag.header()`、`tag.urlencoded()`、`tag.multipart()` 都在 `tag` namespace 下。
- [ ] 没有顶层 `json()` / `query()` / `form()` helper。
- [ ] 没有第二套 JSON 字段名入口。

### 8.3 Symbol namespace

- [ ] `tag.kind.json` 可用于读取 JSON metadata。
- [ ] adapter 导出的 `GormTag.kind` 可用于读取 ORM metadata。
- [ ] 临时创建同名 `Symbol('defjs.gorm.tag')` 不能读到 adapter metadata。

### 8.4 Value tag

- [ ] `tag.json('user_name')` encode 输出 `user_name`。
- [ ] `tag.json('user_name')` decode 读取 `user_name`。
- [ ] `tag.json()` 无参回落到 `fieldKey`。
- [ ] `tag.query()` 无参报错或类型层不允许。
- [ ] `tag.uri()` 无参报错或类型层不允许。
- [ ] `tag.header()` 无参报错或类型层不允许。
- [ ] 同字段多次 `tag.json()` 后写覆盖前写。

### 8.5 Config tag

- [ ] `gorm('column', 'id')` 写入 config `column=id`。
- [ ] `gorm('primaryKey')` 写入 config `primaryKey=true`。
- [ ] `gorm('primaryKey', false)` 写入 config `primaryKey=false`。
- [ ] `gorm('column', 'id')` 后接 `gorm('column', 'user_id')` 最终为 `user_id`。
- [ ] 不同 namespace 的同名 key 不互相覆盖。

### 8.6 Codec

- [ ] JSON encode/decode 使用同一个 `tag.json()`。
- [ ] XML 当前只读取 `tag.xml()` 字段名 metadata。
- [ ] urlencoded encode 使用 `URLSearchParams`。
- [ ] urlencoded 默认 serializer 遇到 object / array / nested value 时抛错。
- [ ] multipart encode 使用 `FormData`。
- [ ] multipart 支持 scalar、Blob、File。
- [ ] multipart object 未配置 serializer 时抛错。
- [ ] query 默认使用 `URLSearchParams`。
- [ ] query complex value 没有 `queryParamsSerializer` 时抛错。
- [ ] query complex value 有 `queryParamsSerializer` 时交给 serializer。

### 8.7 Request-shaped builder

- [ ] `struct.request({ path })` 字段进入 path params。
- [ ] `struct.request({ query })` 字段进入 query。
- [ ] `struct.request({ headers })` 字段进入 headers。
- [ ] `struct.request({ body: struct.json(...) })` 构建 JSON body。
- [ ] `struct.request({ body: struct.urlencoded(...) })` 构建 URLSearchParams body。
- [ ] `struct.request({ body: struct.formData(...) })` 构建 FormData body。
- [ ] `struct.request({ body: struct.text() })` 构建 text body。
- [ ] `struct.request({ body: struct.blob() })` 构建 Blob body。
- [ ] `struct.request({ body: struct.arrayBuffer() })` 构建 ArrayBuffer body。
- [ ] 显式 `build` 优先于 request-shaped 默认构建。
- [ ] request builder 不执行 wire decode。

### 8.8 Type tests

- [ ] `tag.query()` 必须传字段名。
- [ ] `tag.uri()` 必须传字段名。
- [ ] `tag.header()` 必须传字段名。
- [ ] `tag.defineConfig(GormTag)` 返回 `(key, value?) => FieldTagOption`。
- [ ] config value 只接受 `string | number | boolean`。
- [ ] `TypeOf` / `InputOf` 不因 `.tag()` 改变。

### 8.9 HTTP 构建单元测试文件建议

推荐新增：

```text
packages/core/src/internal/request_builder.spec.ts
packages/core/src/http/request.spec.ts
```

struct tag 的 HTTP 构建行为不需要 runtime 级端到端测试。`struct.request(...)` 负责 request pieces 的 section 归属；request builder 只在对应 section / body codec 内读取 `tag.*(...)` 作为 wire key；HTTP request helper 负责 query serializer 和 URL/header/body 合成。

### 8.10 HTTP 构建单元场景 Checklist

- [ ] `buildRequest(input, undefined, { input })` 能按 `struct.request(...)` 构建 request。
- [ ] path：`struct.request({ path: struct.object({ id }) })` 输出 `/users/:id` 参数。
- [ ] query：`struct.request({ query: struct.object({ page }) })` 输出 URL query。
- [ ] query：复杂对象没有 `queryParamsSerializer` 时失败。
- [ ] query：复杂对象有 `queryParamsSerializer` 时输出 serializer 结果。
- [ ] header：`struct.request({ headers: struct.object({ token: struct.string().tag(tag.header('X-Token')) }) })` 输出 header。
- [ ] JSON：`body: struct.json(...)` 生成 JSON body。
- [ ] urlencoded：`body: struct.urlencoded(...)` 生成 `URLSearchParams`。
- [ ] multipart：`body: struct.formData(...)` 生成 `FormData`。
- [ ] 显式 `build` 存在时，不执行 request-shaped 默认构建。
- [ ] internal object 不经过 wire decode。

### 8.11 HTTP 构建单元测试伪代码

```ts
test('builds path, query, header and json body from request shape', () => {
  const input = struct.request({
    path: struct.object({
      id: struct.number(),
    }),
    query: struct.object({
      page: struct.number(),
    }),
    headers: struct.object({
      token: struct.string().tag(tag.header('X-Token')),
    }),
    body: struct.json(struct.object({
      name: struct.string().tag(tag.json('user_name')),
    })),
  })

  const built = buildRequest({
    path: { id: 42 },
    query: { page: 3 },
    headers: { token: 'secret' },
    body: { name: 'Miao' },
  }, undefined, { input })

  expect(built.params).toEqual({ id: 42 })
  expect(built.query).toEqual({ page: 3 })
  expect(built.headers.get('X-Token')).toBe('secret')
  expect(built.body).toBe('{"user_name":"Miao"}')
})
```

```ts
test('uses urlencoded body from request-shaped input', () => {
  const input = struct.request({
    body: struct.urlencoded({
      username: struct.string().tag(tag.urlencoded('username')),
      password: struct.string().tag(tag.urlencoded('password')),
    }),
  })

  const built = buildRequest({ body: { username: 'miao', password: 'secret' } }, undefined, { input })

  expect(built.body).toBeInstanceOf(URLSearchParams)
  expect(String(built.body)).toBe('username=miao&password=secret')
})
```

```ts
test('uses multipart body from request-shaped input', () => {
  const input = struct.request({
    body: struct.formData({
      avatar: struct.file().tag(tag.multipart('avatar')),
      name: struct.string().tag(tag.multipart('name')),
    }),
  })

  const built = buildRequest({ body: { avatar: new File(['x'], 'avatar.png'), name: 'Miao' } }, undefined, { input })

  expect(built.body).toBeInstanceOf(FormData)
  expect(built.body.get('name')).toBe('Miao')
  expect(built.body.get('avatar')).toBeInstanceOf(File)
})
```

---

## 九、实现 Checklist

- [ ] 新代码不把 tag 逻辑塞进 request builder。
- [ ] tag metadata 与 parse/validate 逻辑解耦。
- [ ] object shape 是绑定 `fieldKey` 的唯一位置。
- [ ] metadata 读取结果是只读结构。
- [ ] Symbol namespace 由模块导出，不在调用点临时创建。
- [ ] serializer 对复杂值的默认行为必须明确，不能静默 stringify object。
- [ ] error message 包含 codec、field key、wire key。
- [ ] tests 覆盖运行时行为和类型行为。
- [ ] 文档示例与真实 API 保持一致。

---

## 十、验证命令

在 `packages/core` 下运行：

```sh
bun run test:bun
bun run test:types
bun run test:node
```

跨 runtime 变更后再运行：

```sh
bun run test:chrome
bun run test:firefox
bun run test:safari
bun run test:deno
```

最终检查：

```sh
git diff --check
rg "tag\\.form\\b|schema\\." packages/core/src packages/core/research
```

其中 `schema` 只允许出现在迁移前旧代码或历史研究说明里，新 `struct` 实现和新示例不应出现旧调用入口。

---

## 十一、完成定义

完成标准：

- public API 以 `struct` 和 `tag` 为中心。
- tag metadata 能被 core codec、request builder、外部 adapter 读取。
- value tag 和 config tag 都有完整测试。
- urlencoded、multipart、query 三条序列化路径明确分离。
- 默认 serializer 不静默吞复杂对象。
- 没有第二套 JSON 字段名入口。
- 显式 request `build` 仍然优先。
- 所有目标测试通过。

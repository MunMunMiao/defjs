# Struct Tag 设计与应用

> 当前状态：历史研究文档。endpoint 默认请求构建不由 `tag.uri/query/header/json` 决定 placement；当前权威合同是 `struct.request({ path, query, headers, body })`、body wrapper 和 Go-style `tag.*(...)` wire key。本文保留为 tag metadata / adapter 设计背景，不作为 request construction 规范。

## 一、核心结论

`tag` 是挂在 struct 字段上的 metadata，供序列化、反序列化、HTTP binder、HTTP request builder、ORM、migration、validator 等 consumer 读取。

Go 的 struct tag 也是这个模型：

```go
type Req struct {
    ID   int64  `json:"id" uri:"id" gorm:"column:id;primaryKey"`
    Name string `json:"user_name" form:"user_name" gorm:"column:user_name;size:128;not null"`
}
```

但 Go 只能把 tag 写成一段字符串，这是语言限制，不是我们必须复制的 API 形状。

在 TypeScript 里，推荐模型是：

- package / public API 命名从 `schema` 收口为 `struct`。
- 所有内置 tag helper 都挂在 `tag` namespace 下，例如 `tag.json()`、`tag.query()`、`tag.multipart()`。
- JSON 字段名只通过 `tag.json()` 表达。
- tag namespace 的内部 key 用 `Symbol`，避免字符串命名冲突。
- 普通 codec tag 使用单值形式，例如 `tag.json('user_name')`。
- ORM / migration 这类复杂 tag 使用 key-value 形式，例如 `gorm('column', 'id')`、`gorm('primaryKey', true)`。
- 同一 namespace 下同一个 key 多次写入时，后一次覆盖前一次。
- consumer 只读取自己认识的 namespace，其他 tag 对它无意义。

示例：

```ts
import { struct, tag } from '@defjs/struct'
import { gorm } from '@defjs/gorm/tag'

const createUserInput = struct.object({
  id: struct.number().tag(tag.json('id'), tag.uri('id'), gorm('column', 'id'), gorm('primaryKey', true)),
  page: struct.number().tag(tag.query('page')),
  avatar: struct.file().tag(tag.multipart('avatar')),
  token: struct.string().tag(tag.header('X-Token')),
  name: struct
    .string()
    .tag(
      tag.json('user_name'),
      tag.xml('user_name'),
      tag.urlencoded('user_name'),
      gorm('column', 'user_name'),
      gorm('size', 128),
      gorm('notNull', true),
    ),
})
```

这里的 `gorm()` 可以由 ORM adapter 提供，不需要 core 内置数据库选项。

---

## 二、字段、tag、consumer 的关系

推荐的心智模型：

```text
internal object
  { name: "Miao" }

struct field
  name

tag metadata
  json -> value: "user_name"
  urlencoded -> value: "user_name"
  gorm -> config:
    column = "user_name"
    size = 128
    notNull = true

JSON serializer
  { "user_name": "Miao" }

JSON deserializer
  { "user_name": "Miao" } -> { name: "Miao" }

application/x-www-form-urlencoded serializer
  URLSearchParams("user_name=Miao")

multipart/form-data serializer
  FormData field "user_name"

GORM adapter
  column/user_name + size/128 + notNull/true
```

对 serializer/deserializer 这类 consumer，同一个 tag 双向使用：

- encode: internal field -> wire key
- decode: wire key -> internal field

对 ORM / migration 这类 consumer，tag 是字段配置：

- column name
- primary key
- index
- relation
- migration hints

这些都不是另一套方向语义，只是不同 consumer 读取同一份字段 metadata。

---

## 三、`struct` 包命名

`schema` 这个名字太宽，容易和 JSON Schema、Standard Schema、数据库 schema、OpenAPI schema 混在一起。当前讨论的是“类似 Go struct 的字段定义和 tag metadata”，所以 public API 建议改名为 `struct`。

推荐：

```ts
struct.object({
  id: struct.number().tag(tag.json('id')),
})
```

不推荐继续把新设计写成旧包名风格。

兼容策略：

- 新文档、新示例、新 API surface 统一使用 `struct`。
- 旧包名只作为迁移来源被提及，不进入新的 public API 设计。
- 迁移工具可以做机械 rename，但新运行时不应继续暴露旧包名入口。
- `struct` 是 package identity，不代表运行时必须生成 JS class 或 Go struct。

---

## 四、tag namespace 必须集中在 `tag`

内置 helper 不应暴露成顶层 `json()`、`xml()`、`query()` 这类名字。这些词太常见，容易和业务函数、序列化函数、HTTP client option 冲突。

推荐：

```ts
tag.json('user_name')
tag.xml('user_name')
tag.query('page')
tag.uri('id')
tag.header('X-Token')
tag.urlencoded('name')
tag.multipart('avatar')
```

不推荐：

```ts
json('user_name')
query('page')
form('name')
```

扩展 tag 可以由 adapter 导出自己的 helper：

```ts
import { gorm } from '@defjs/gorm/tag'

struct.string().tag(tag.json('user_name'), gorm('column', 'user_name'), gorm('notNull', true))
```

---

## 五、建议的内部模型

`kind` 使用 `Symbol`，不是裸字符串。

原因：

- 字符串容易和用户自定义 namespace 冲突。
- Symbol 可以由 core 或 adapter 明确导出，consumer 直接用同一个 symbol 查 metadata。
- debug / 导出时仍可保留 `name`，但 Map key 应该是 symbol。

示意类型：

```ts
type TagScalar = string | number | boolean

interface TagNamespace<TName extends string = string> {
  readonly kind: symbol
  readonly name: TName
}

interface FieldTag {
  readonly namespace: TagNamespace
  readonly value: TagScalar | undefined
  readonly config: ReadonlyMap<string, TagScalar>
}

interface MutableFieldTag {
  namespace: TagNamespace
  value: TagScalar | undefined
  config: Map<string, TagScalar>
}

interface FieldTagContext {
  readonly fieldKey: string
  readonly tags: Map<symbol, MutableFieldTag>
}

type FieldTagOption = (context: FieldTagContext) => void
```

内置 namespace 示例：

```ts
export const JsonTag: TagNamespace<'json'> = {
  kind: Symbol('defjs.struct.tag.json'),
  name: 'json',
}

export const QueryTag: TagNamespace<'query'> = {
  kind: Symbol('defjs.struct.tag.query'),
  name: 'query',
}

export const builtinTagKind = Object.freeze({
  json: JsonTag.kind,
  query: QueryTag.kind,
} as const)
```

所有内置 namespace 的 symbol 都应通过 `tag.kind.*` 暴露，供 metadata 读取方稳定查找。helper 本身仍然挂在 `tag.*` 下。上面的 `builtinTagKind` 对应 public API 中的 `tag.kind`。

Symbol 身份合同：

- core 和 adapter 必须导出稳定的 namespace object，不允许调用方临时创建同名 symbol。
- 默认使用导出的唯一 `Symbol()`，不使用 `Symbol.for()` 的全局 registry。
- 这样冲突边界由 import 来源决定，而不是由全局字符串决定。
- 如果某个 adapter 明确需要跨 realm / 多副本共享 symbol，必须由 adapter 自己文档化 `Symbol.for()` key 的所有权和兼容策略。

adapter namespace 示例：

```ts
export const GormTag: TagNamespace<'gorm'> = {
  kind: Symbol('defjs.gorm.tag'),
  name: 'gorm',
}
```

---

## 六、value tag 与 config tag

### 6.1 value tag

value tag 只有一个主值，适合字段名映射。

```ts
tag.json('user_name')
tag.query('page')
tag.header('X-Token')
```

实现形状：

```ts
function defineValueTag(namespace: TagNamespace): (value?: string) => FieldTagOption {
  return (value) => (context) => {
    const tag = ensureTag(context.tags, namespace)
    tag.value = value ?? context.fieldKey
  }
}
```

`tag.json()`、`tag.urlencoded()`、`tag.multipart()` 这类 body codec helper 可以无参，因为它们能回落到 `fieldKey`。`tag.query()`、`tag.uri()`、`tag.header()` 建议显式传值，避免误暴露 URL 或 header 字段。

### 6.2 config tag

config tag 是 key-value 结构，适合 ORM / migration / validator 等复杂 consumer。

```ts
gorm('column', 'user_name')
gorm('size', 128)
gorm('notNull', true)
gorm('primaryKey', true)
```

实现形状：

```ts
function defineConfigTag(namespace: TagNamespace) {
  return (key: string, value: TagScalar = true): FieldTagOption =>
    (context) => {
      const tag = ensureTag(context.tags, namespace)
      tag.config.set(key, value)
    }
}
```

这里 `value` 默认是 `true`，所以 flag 可以写成：

```ts
gorm('primaryKey')
gorm('notNull')
```

如果需要显式关闭，可以写：

```ts
gorm('primaryKey', false)
```

### 6.3 覆盖规则

同一 namespace 下，同一 key 后写覆盖前写。

```ts
struct.string().tag(gorm('column', 'name'), gorm('column', 'user_name'))
```

最终结果：

```text
gorm.column = "user_name"
```

value tag 也按同一规则处理：它可以看成写入保留 key `value`。

```ts
struct.string().tag(tag.json('name'), tag.json('user_name'))
```

最终 JSON 字段名是 `user_name`。

不要对重复 key 报错。覆盖是明确、简单、可解释的行为。

---

## 七、GORM / Bun 对齐

Go 里只能写：

```go
gorm:"column:id;primaryKey"
bun:"id,pk,autoincrement"
```

这是把结构化配置压缩成字符串。我们没有这个限制，所以 TS API 可以直接保留结构。

推荐：

```ts
const user = struct.object({
  id: struct.number().tag(gorm('column', 'id'), gorm('primaryKey'), gorm('autoIncrement')),
  name: struct.string().tag(gorm('column', 'user_name'), gorm('size', 128), gorm('notNull')),
})
```

如果某个 adapter 需要生成 Go-like 字符串，它可以在 adapter 内部渲染：

```text
column=user_name
size=128
notNull=true
  -> gorm:"column:user_name;size:128;not null"
```

core 不需要知道 GORM 的完整 option 表，也不需要知道 Bun 的完整 option 表。

---

## 八、HTTP tag 应用边界

### 8.1 `tag.json`

用于 JSON object 的字段名。

读者：

- JSON encoder
- JSON decoder

默认：

- 未传字段名时使用 `fieldKey`。

### 8.2 `tag.xml`

用于 XML element / attribute 的字段名。

读者：

- XML encoder
- XML decoder

实现边界：

- XML 的 element、attribute、namespace、text node 等规则比 JSON 更复杂。
- 当前 `tag.xml('name')` 只定义字段名 metadata。
- 如果未来需要 attribute / namespace 等配置，应作为 XML adapter 的 config tag 扩展，而不是塞进 `tag.xml()` 的第二参数。

### 8.3 `tag.urlencoded`

用于 `application/x-www-form-urlencoded` body。

读者：

- urlencoded encoder
- urlencoded decoder

实现边界：

- encode 默认使用 `URLSearchParams`。
- 默认 serializer 只接受 scalar / string-like value。
- object、array、nested value 不能静默交给 `URLSearchParams`，否则容易产生 `[object Object]` 或隐式 join。
- 复杂 value 必须显式配置 body serializer option；没有配置时应抛错。

### 8.4 `tag.multipart`

用于 `multipart/form-data` body。

读者：

- multipart encoder
- multipart decoder

实现边界：

- encode 使用 `FormData`。
- 未传字段名时可以回落到 `fieldKey`。
- 支持 `Blob`、`File`、stream-like value 时，应由 multipart serializer 处理。
- 不要和 `application/x-www-form-urlencoded` 共用一个 `form` tag；它们在 body 区域是不同实现。

### 8.5 `tag.query`

用于 URL query string。

读者：

- query encoder
- query decoder

实现边界：

- 默认使用 `URLSearchParams`。
- 默认 serializer 只接受 scalar / string-like value。
- object、array、nested value 必须走 `queryParamsSerializer` 模式；没有配置时应抛错。
- 第三方 serializer 可以读取 `tag.query()` metadata，但展开策略属于 serializer，不属于 tag。
- query 是 URL 的一部分，不应默认暴露所有未标记字段。

### 8.6 `tag.uri`

用于 path template variable。

读者：

- path encoder
- path decoder / route binder

实现边界：

- 必须显式声明字段名，因为它必须匹配 path template。

### 8.7 `tag.header`

用于 HTTP header。

读者：

- header encoder
- header decoder

实现边界：

- 必须显式声明 header 名。
- header 值最终必须是 string 或 string-like。
- 安全敏感 header 不应被普通 struct 自动生成。

---

## 九、请求构建器如何使用 tag

HTTP request builder 是多个 serializer 的组合器。`struct.request({ path, query, headers, body })` 先决定字段所属 section；每个 section 或 body codec 再读取自己 namespace 下的 tag 作为 wire key。tag 不单独决定字段属于 path、query、headers 或 body。

正确流程：

```text
用户传入 request-shaped internal object
  -> 按 struct.request section 读取 path/query/headers/body
  -> validate selected section value
  -> encode path variables
  -> encode query
  -> encode headers
  -> encode selected body codec
```

示例：

```text
uri serializer
  request.path.id + tag.uri("id") -> /users/42

query serializer
  request.query.page + tag.query("page") -> ?page=3

header serializer
  request.headers.token + tag.header("X-Token") -> X-Token: secret

json serializer
  name + tag.json("user_name") -> { "user_name": "Miao" }

urlencoded serializer
  name + tag.urlencoded("user_name") -> URLSearchParams

multipart serializer
  avatar + tag.multipart("avatar") -> FormData
```

不要把用户传入的 internal object 当成 wire JSON 先 decode 一遍。

---

## 十、推荐落地步骤

### 10.1 第一阶段：metadata

先实现：

```ts
struct.string().tag(tag.json('user_name'))
struct.string().tag(tag.xml('user_name'))
struct.string().tag(tag.urlencoded('user_name'))
struct.file().tag(tag.multipart('avatar'))
struct.number().tag(tag.query('page'))
struct.number().tag(tag.uri('id'))
struct.string().tag(tag.header('X-Token'))
```

同时提供 extension helper：

```ts
const GormTag = {
  kind: Symbol('defjs.gorm.tag'),
  name: 'gorm',
} as const

const gorm = tag.defineConfig(GormTag)

struct.number().tag(gorm('column', 'id'), gorm('primaryKey'))
```

metadata 读取：

```ts
getFieldTags(field)
getFieldTag(field, tag.kind.json)
getFieldTag(field, GormTag.kind)
```

这一阶段不要做 request builder 默认策略。

### 10.2 第二阶段：内部 codec encode/decode

实现明确的内部 codec；这些 helper 不作为默认 public struct API 暴露：

```ts
internalJsonEncode(struct, value)
internalJsonDecode(struct, value)
internalUrlencodedEncode(struct, value)
internalUrlencodedDecode(struct, value)
internalMultipartEncode(struct, value)
internalMultipartDecode(struct, value)
```

要求：

- encode 读 internal field key，输出 wire key。
- decode 读 wire key，输出 internal field key。
- 同一个 tag 同时服务 encode/decode。

### 10.3 第三阶段：request builder

request builder 只调用 serializer：

```text
path <- encode uri
query <- encode query with URLSearchParams or queryParamsSerializer
headers <- encode header
body <- encode selected body codec
```

显式 `build` 仍然优先。自动构建只是默认 request builder，不覆盖手写 build。

### 10.4 第四阶段：测试

必须覆盖：

- 所有内置 helper 都在 `tag` namespace 下。
- `struct` 示例和导出命名不再使用 `schema`。
- `kind` 用 Symbol 查找，不靠裸字符串。
- 内置和 adapter namespace 通过导出的唯一 Symbol 识别，不依赖调用方临时创建同名 symbol。
- value tag 后写覆盖前写。
- config tag 同 namespace 同 key 后写覆盖前写。
- `gorm('primaryKey')` 默认写入 `true`。
- `gorm('primaryKey', false)` 可以显式关闭。
- `application/x-www-form-urlencoded` 使用 `URLSearchParams`。
- urlencoded 默认 serializer 遇到 object / array / nested value 时抛错。
- `multipart/form-data` 使用 `FormData`。
- `tag.multipart()` 无参时可以回落到 `fieldKey`。
- query 默认使用 `URLSearchParams`。
- query object / array / nested value 没有 `queryParamsSerializer` 时抛错。
- query object / array / nested value 可以走 `queryParamsSerializer`。
- request builder 不把 internal object 当 wire object decode。

---

## 十一、最终决策

当前决策：

- public API 统一使用 `struct`，旧包名不进入新的 public API 设计。
- 内置 helper 全部挂在 `tag` namespace 下。
- JSON 字段名只通过 `tag.json()` 表达。
- tag namespace 内部 key 使用导出的唯一 Symbol。
- tag metadata 支持 value tag 和 config tag。
- 普通 codec 使用 value tag。
- ORM / migration / validator 使用 config tag。
- 同 namespace 同 key 后写覆盖前写。
- `multipart/form-data` 和 `application/x-www-form-urlencoded` 必须拆成不同 tag。
- query 和 urlencoded 默认 serializer 只接受 scalar / string-like value；复杂对象没有显式 serializer 时抛错。
- query 复杂对象映射走 `queryParamsSerializer`。
- core 不枚举 GORM / Bun 配置项，adapter 自己定义 helper 和解释规则。

这才是对齐 Go struct tag 心智模型，同时利用 TypeScript 表达能力后的设计。

---

## 十二、参考依据

- Go `reflect.StructTag.Lookup` 区分 tag value 为空和 tag 不存在：<https://pkg.go.dev/reflect#StructTag.Lookup>
- GORM model tag 把 `column`、`type`、`primaryKey`、`size`、`not null` 等配置放在 `gorm:"..."` value 内，由 GORM 自己解析：<https://gorm.io/docs/models.html>
- Go Bun model tag 把列名、`pk`、`autoincrement`、`notnull`、relation 等配置放在 `bun:"..."` value 内，由 Bun 自己解析：<https://bun.uptrace.dev/guide/models.html>

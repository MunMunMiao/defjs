# struct

`struct` 是 TypeScript 里的 Go struct 心智：声明字段、解析输入、拿到零值友好的结果，并用 tag 描述外部协议里的字段名。它不是 validation DSL，也不提供一整套字符串、数字、数组的快捷约束。

## 基本使用

```ts
import { struct, tag, type Infer } from '@defjs/core'

const User = struct.object({
  id: struct.string().tag(tag.json('id')),
  name: struct.string().tag(tag.json('user_name')),
  age: struct.number(),
  active: struct.boolean(),
})

type User = Infer<typeof User>

const [err, user] = User.parse({
  id: 'u_1',
  user_name: 'Miao',
  age: 18,
})
if (err) {
  throw err
}

user.active // false
```

Parse 返回 `[err, value]`。使用方式保持 Go-style：先短路 `err`，再使用 `value`。

## 类型

只导出一个类型推断工具：

```ts
type User = Infer<typeof User>
```

`Infer<T>` 表示 parse 后的输出类型。tag 只影响外部字段名，不改变输出类型。

## 字段

常用字段构造器：

```ts
struct.string()
struct.number()
struct.boolean()
struct.date()
struct.bigint()
struct.array(struct.string())
struct.record(struct.string())
struct.tuple([struct.string(), struct.number()])
struct.object({ id: struct.string() })
struct.or(struct.string(), struct.number())
struct.discriminatedUnion('type', [
  struct.object({ type: struct.literal('message'), body: struct.string() }),
  struct.object({ type: struct.literal('count'), count: struct.number() }),
])
```

缺失字段会走对应类型的零值。可选字段使用 `optional()`，空值字段使用 `null()` 或 `nullish()`。

## 自定义规则

没有内建的 `email()`、`min()`、`int()` 这类快捷方法，也不把业务校验塞进 struct 链式 API。struct 只负责结构解析；业务约束放在应用层、路由层、Standard Schema 适配器，或单独的 validator 里：

```ts
const UserId = struct.string()

const [err, id] = UserId.parse('u_1')
if (err) {
  throw err
}

if (!id.startsWith('u_')) {
  throw new Error('invalid user id')
}
```

## Tag

Tag 用来描述字段在 JSON、query、form、header 等协议里的名字。

```ts
const Query = struct.object({
  pageSize: struct.number().tag(tag.json('page_size'), tag.query('page_size')),
})
```

```ts
import { decodeJson, encodeJson } from '@defjs/core'

const [err, value] = Query.parse(decodeJson(Query, { page_size: 50 }))
if (err) {
  throw err
}

encodeJson(Query, value) // { page_size: 50 }
```

## Parse Policy

Object 默认丢弃未知字段，接近 Go JSON 默认行为：

```ts
const User = struct.object({ id: struct.string() })

const [err, user] = User.parse({ id: 'u_1', extra: 'ignored' })
if (err) {
  throw err
}

user // { id: 'u_1' }
```

需要拒绝未知字段时使用 parse option：

```ts
const [err] = User.parse({ id: 'u_1', extra: 'no' }, { unknownFields: 'error' })
if (err) {
  // handle unknown field
}
```

## 递归结构

没有显式递归构造器。递归 object 使用 getter 表达字段懒读取：

```ts
type Category = {
  children: Category[]
  id: string
}

const Category = struct.object({
  id: struct.string(),
  get children() {
    return struct.array(Category)
  },
})

const [err, category] = Category.parse({
  children: [],
  id: 'root',
})
if (err) {
  throw err
}
```

## Standard Schema

每个 struct 都暴露 `~standard`，可被支持 Standard Schema 的调用方消费。

```ts
const result = User['~standard'].validate({ id: 'u_1', name: 'Miao' })
```

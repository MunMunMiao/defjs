# Go Web 框架请求绑定调研

这份文档对比 Go 生态里有代表性的 Web request 处理/绑定方案如何读取 HTTP request，并绑定到 Go struct。目标不是复制某个框架，而是提炼 `@defjs/core` 在 `struct.request(...)` 与 `defineXXX.build` 设计里应该遵守的 Go-style 合同。

## 核心结论

Go 生态里最稳定的共同形状是：

1. 请求数据绑定到专门的 input struct。
2. struct tag 或 request DTO 结构描述 wire source / wire key。
3. 框架通常同时提供自动/聚合绑定和指定来源绑定。
4. 自动多来源绑定必须定义覆盖顺序。
5. body 绑定通常由 Content-Type 驱动，或由用户显式选择格式。
6. validation 通常贴近 binding，但 tag 名和运行时流程仍然分开。
7. 极简 router 保留手动解析能力，不强行变成完整 binder。

对 `@defjs/core` 的干净翻译是：

1. 默认请求构建使用 `struct.request({ path, query, headers, body })`，让 request DTO 结构直接表达 placement。
2. endpoint 未提供 `build` 时只消费 `struct.request(...)` 的 request sections，不从字段 tag 推断字段属于哪里。
3. 显式 `build(ctx, input)` 是完整逃生舱，写了 `build` 后不做隐式 merge。
4. body codec 由 body wrapper 决定，例如 `struct.json(...)`、`struct.formData(...)`，不使用 endpoint-level body selector。
5. `tag.*('wire-name')` 只负责 Go-style field tag / wire key。
6. HTTP / SSE / WebSocket 的 builder 保持 transport-specific。

## 样本分层

这里的“主流”不按单一 GitHub star 或公司背书排序，而按**生态代表性 + 设计覆盖面**取样：

| 分层               | 框架/库                                          | 为什么纳入                                                                                      |
| ------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 标准库基线         | `net/http`                                       | Go Web request parsing 的底座，提供手动解析与 ServeMux path value                               |
| 经典 struct binder | Gin、Echo、Fiber、Beego、GoFrame、Hertz、Buffalo | 覆盖 Content-Type 推断、source-specific binder、多来源覆盖顺序、form/json/header/path/query tag |
| 极简 router        | Chi                                              | 代表“小内核 + 标准库 + 可选 render”的路线，提醒我们不要把 binder 做成强制大抽象                 |
| typed API 校准样本 | Huma                                             | 不是传统 router 的同类竞品，但对“一整个 input struct 表示整份 request”最有参考价值              |

所以本文不会说“所有 Go 框架都只有同一种绑定方式”。更准确的结论是：

> 在提供 struct binding 的 Go Web 框架中，struct tag 是主流 wire mapping 机制；而 `net/http` 与 Chi 代表的极简路线，则证明低层手动逃生舱同样是 Go-style。

## 推导边界

Go 框架调研的是 server-side request binding；`@defjs/core` 要设计的是 client-side request building。二者不是同一个运行方向：

- Go server：从 HTTP request 读 path/query/header/body，再填入 struct。
- `@defjs/core` client：从 typed input value 出发，按 endpoint definition 构造 path/query/header/body。

这里采用的是**对偶启发**，不是行为照搬：

1. Go 的 `query:"page"` 说明字段的 query wire key；本库用 `struct.request({ query: ... })` 把字段放入 query section，并用 `.tag(tag.query('page'))` 表达 wire key。
2. Go 的 `json:"name"` 说明 body JSON key；本库用 `struct.json(...)` 表达 JSON body，并用 `.tag(tag.json('name'))` 表达 JSON key。
3. Go 的 `BindQuery` / `BindHeaders` 说明 source-specific API 合理；本库保留 `build` 与 `encodeQueryParams` 等 helper，而不是强推 all-source 自动绑定。
4. Go server 运行时可根据 `Content-Type` 猜 body binder；本库的 endpoint definition 已经知道协议，因此选择 body wrapper 更冷静。

## Baseline：`net/http`

官方来源：https://pkg.go.dev/net/http

`net/http` 是手动解析基线。它不会自动把 request bind 到 struct；handler 直接操作 `*http.Request`：

- `ParseForm` 会解析所有 request 的 URL query；对 POST/PUT/PATCH 的 `application/x-www-form-urlencoded` body，还会解析 body。
- `Request.Form` 中 form body 参数优先于 query 参数。
- `FormValue` 会自动调用 form parsing helper，并返回字符串，但隐藏 parse error。
- `PostFormValue` 忽略 URL query，只读取 POST/PUT/PATCH body 参数。
- `ParseMultipartForm` 处理 multipart，并会调用 `ParseForm`。
- Go 1.22 的 `PathValue(name)` 可读取 ServeMux path wildcard。

对 `@defjs/core` 的启发：

- 低层逃生舱必须是一等能力。
- 不要静默混合 query 和 body，除非 API 名字明确表达这个行为。
- 隐藏错误的便捷 helper 只能是 convenience，不能成为核心合同。

## Gin

官方来源：

- https://gin-gonic.com/en/docs/binding/
- https://gin-gonic.com/en/docs/binding/only-bind-query-string/
- https://github.com/gin-gonic/gin/blob/master/docs/doc.md

Gin 提供两族 binding 方法：

- `Bind*`：出错时自动 abort request 并写 400。
- `ShouldBind*`：返回 error，由 handler 自己处理。

Gin 支持 JSON、XML、YAML、TOML、form、query、URI、header。常用 tag 包括 `json`、`xml`、`yaml`、`form`、`uri`、`header`；validation 放在单独的 `binding` tag。

关键行为：

- `ShouldBind` 可以根据 `Content-Type` 推断 binder。
- `ShouldBindQuery` 只绑定 query，忽略 body；官方明确说这能避免 POST body 覆盖 query filter。
- Gin 提供 query、URI、header 等指定来源绑定方法。

对 `@defjs/core` 的启发：

- 指定来源绑定本身就是 Go-style，不是 Go-style 的反面。
- validation 不应合并进 transport binding tag。
- Gin 有 Content-Type 推断，但本库是 client request builder，endpoint 静态声明 body codec 更干净。

## Echo

官方来源：https://echo.labstack.com/docs/binding

Echo 用 tag 绑定多个来源：

- `query`：query 参数
- `param`：path 参数
- `header`：header
- `json` / `xml`：body
- `form`：form data

Echo 默认 `Context#Bind` 的来源顺序是：

1. path 参数
2. GET/DELETE 的 query 参数
3. request body

后绑定的阶段会覆盖前面阶段的值。header 不包含在默认 `Context#Bind` 中，必须直接调用 `BindHeaders`。Echo 还明确提醒：如果 bound struct 里有不该被请求控制的 exported 字段，不要把它直接传给业务层，应该使用专门 DTO 再显式映射。

对 `@defjs/core` 的启发：

- 多来源绑定天然带覆盖语义；如果本库未来支持，必须显式打开。
- header 是典型的 opt-in transport metadata，不能在所有场景里顺手绑定。
- endpoint input struct 应该是 DTO，不是业务对象。

## Fiber

官方来源：

- https://docs.gofiber.io/api/bind/
- https://docs.gofiber.io/api/ctx

Fiber 提供 `c.Bind()`，以及 `All`、`Body`、`Form`、`JSON`、`Header`、`Query`、`Cookie`、`URI` 等 binder。

`All` 会把 URL params、body、query、headers、cookies 绑定到一个 struct。Fiber 文档列出的优先级是：

1. URI
2. Body
3. Query
4. Header
5. Cookie

body 只有在 request 同时有非空 body 和非空 `Content-Type` 时才参与。Body binding 会按 content type 使用对应 tag，例如 `json`、`form`、`xml`。

对 `@defjs/core` 的启发：

- “All sources” binder 是有用能力，但必须配一张覆盖顺序表。
- body 不能只靠 field tag 推断；request-level body/content-type 条件也很重要。
- client request construction 不应该默认依赖覆盖顺序，因此本库不应默认做 `All` 语义。

## Chi

官方来源：

- https://github.com/go-chi/chi
- https://pkg.go.dev/github.com/go-chi/chi/v2@v2.1.1/render

Chi 的 core router 很小，贴着标准库 `http.Handler` 和 `*http.Request`。Path values 通过 `chi.URLParam` 这类 helper 读取。

可选的 `chi/render` 包提供 `Bind(r, v)`，但它是 payload pattern：decode request body 后调用 payload struct 自己的 `Bind(*http.Request) error` 方法。它不是 path/query/header/body 的通用 struct-tag binder。

对 `@defjs/core` 的启发：

- 极简 router 风格强调显式组合，而不是巨大自动 binder。
- per-input hook 可以是干净的 validation/normalization 逃生舱，但它与 transport metadata 分离。
- `build(request, input)` 与 Chi 的“自己掌控 request handling”精神一致。

## Beego

官方来源：https://beegodoc.com/en-US/developing/web/input/

Beego 把输入 helper 分成两类：

- `Get*`：读取单个值。
- `Bind*`：把 input 转换成结构体。

`Get*` 会读取 query 和 form；如果两边都有同名参数，form 胜出。body 绑定支持 `Bind`、`BindJSON`、`BindForm`、`BindXML`、`BindYAML`、`BindProtobuf` 等。虽然 `Bind` 可以按 `Content-Type` 选择格式，但 Beego 文档建议只接受特定格式的 API 使用显式格式方法。历史上还有 `Input.Bind(&value, key)` 这类单参数绑定方法。

对 `@defjs/core` 的启发：

- 显式 source/format 操作是 Go-style。
- 接口只该接受一种 body 格式时，显式 body format 比自动多格式更好。
- 逃生舱要足够顺手，否则用户会要求自动 binder 覆盖所有 legacy shape。

## GoFrame

官方来源：https://goframe.org/en/docs/web/request-struct-converting

GoFrame 推荐 struct 化请求参数，提供 `Request.Parse` 与 `Get*Struct`。它的默认映射比多数框架更宽松：

- 只有公开字段可绑定。
- 参数名匹配不区分大小写。
- 匹配时忽略 `-`、`_`、空格。
- 无法匹配的 request key 会被忽略。

自定义映射可以使用 `p`、`param`、`params` tag。`Parse` 在有 validation tag 时也会做校验。

对 `@defjs/core` 的启发：

- 默认字段名模糊匹配很省事，但会削弱 wire contract 的显式性。
- 对 client SDK/core 来说，显式 request sections 与 Go-style `tag.*(...)` 比 fuzzy matching 更稳。
- validation 应该保持相邻但分离，不塞进 transport tag。

## Hertz

官方来源：

- https://www.cloudwego.io/docs/hertz/tutorials/basic-feature/context/request/
- https://www.cloudwego.io/docs/hertz/tutorials/basic-feature/binding-and-validate/

Hertz 同时提供 direct request accessor 与 `Bind`、`BindAndValidate`、`BindQuery`。支持的 tag 包括：

- `path`
- `form`
- `query`
- `cookie`
- `header`
- `json`
- `raw_body`
- `default`

Hertz 文档列出的绑定优先级是：

1. path
2. form
3. query
4. cookie
5. header
6. json
7. raw_body

`BindQuery` 是 query-only 的 source-specific convenience。

对 `@defjs/core` 的启发：

- 多来源绑定可以很 Go-style，但前提是优先级显式。
- `raw_body` 是真实的低层 body 逃生舱；本库已有 `request.body(...)`。
- `default` 属于 parse/default policy，不属于 transport binding。

## Buffalo

官方来源：https://gobuffalo.io/documentation/request_handling/bind/

Buffalo 的 `Context.Bind` 会把 form 或 JSON/XML body 映射到 struct。它通过 `Content-Type` 或 `Accept` 找对应 binder。HTML/form 使用 `form` tag 或字段名；JSON/XML 使用标准库 `json` / `xml` tag。Buffalo 也允许注册自定义 binder。

对 `@defjs/core` 的启发：

- content-type 到 codec registry 是 server framework 常见能力。
- client-side endpoint definition 可以避免 runtime guessing，直接静态声明 body codec。
- 自定义 binder 对应本库的 `build`，不对应更多自动魔法。

## Huma

官方来源：

- https://huma.rocks/features/request-inputs/
- https://huma.rocks/features/operations/
- https://huma.rocks/features/request-validation/

Huma 更接近 typed API framework，而不是传统 router。它把整个 request 表达为一个 input struct：

- `path`、`query`、`header`、`cookie` tag 描述 request parameters。
- 特殊字段 `Body` 表示 request body。
- `RawBody []byte` 可暴露原始 request bytes。
- path params 永远 required。
- query/header/cookie 默认 optional。
- request/response struct 还用于 OpenAPI/JSON Schema。

对 `@defjs/core` 的启发：

- Huma 是“一整个 input struct 表示整份 request”的最强证据。
- Huma 的特殊 `Body` 字段不必照搬成同名字段；本库用 `body: struct.json(...)` / `struct.formData(...)` 表达同一位置。
- 重要原则不是 `Body` 这个名字，而是 endpoint input DTO 在一个地方拥有 path/query/header/body metadata。

## 跨框架发现

| 发现                                                     | 代表框架                                                        | 对本库的设计后果                                                      |
| -------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------- |
| 在 struct binder 中，struct tag 是主流 wire mapping 机制 | Gin、Echo、Fiber、GoFrame、Hertz、Buffalo、Huma                 | 保留显式 wire mapping；本库默认构建用 request sections + `tag.*(...)` |
| Source-specific binder 很常见                            | Gin、Echo、Fiber、Beego、Hertz                                  | 保留显式 `build` 和 codec helpers                                     |
| All-source binding 必须定义优先级                        | Echo、Fiber、Hertz、net/http form parsing                       | 不默认做隐式 merge                                                    |
| Body codec 由 content type 或显式方法决定                | Gin、Fiber、Beego、Buffalo                                      | body wrapper 显式决定 codec                                           |
| Header binding 经常是特殊来源                            | Echo 默认不绑 header；浏览器 WebSocket 不支持自定义握手 header  | 保持 transport-specific builder                                       |
| Validation 相邻但不等同                                  | Gin `binding`、Hertz `BindAndValidate`、GoFrame validation tags | 不把 `struct` transport tag 扩成业务 validation DSL                   |
| DTO 安全边界重要                                         | Echo security warning                                           | 鼓励 dedicated input struct                                           |
| 极简 router 不强推 binder                                | net/http、Chi                                                   | 保留低层逃生舱                                                        |

## 框架矩阵

| 框架/库    | 定位                 | 自动/聚合入口              | 指定来源入口                                                      | 主要 tag                                                                          | 覆盖顺序                                                      | Header 是否默认            | Body codec 选择                     | 对本库结论                                    |
| ---------- | -------------------- | -------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------- | ----------------------------------- | --------------------------------------------- |
| `net/http` | 标准库基线           | 无 struct binder           | `ParseForm` / `PostFormValue` / `PathValue` 等手动 API            | 无框架 tag                                                                        | `Request.Form` 中 form body 覆盖 query                        | 手动读取                   | 手动读取 / form parser              | 保留低层逃生舱，不默认混源                    |
| Gin        | 经典 binder          | `Bind` / `ShouldBind`      | `ShouldBindQuery` / URI / header / JSON 等                        | `json` / `form` / `uri` / `header` / `binding`                                    | 由具体 binder 或 Content-Type 决定                            | 可显式绑定 header          | `ShouldBind` 可按 Content-Type 推断 | source-specific helper 是 Go-style            |
| Echo       | 经典 binder          | `Context#Bind`             | `BindBody` / `BindQueryParams` / `BindPathValues` / `BindHeaders` | `param` / `query` / `header` / `json` / `xml` / `form`                            | path -> query(GET/DELETE) -> body，后者覆盖前者               | 否，必须 `BindHeaders`     | 按 Content-Type                     | 不默认 multi-source merge，header 要显式      |
| Fiber      | 经典 binder          | `c.Bind().All`             | `Body` / `JSON` / `Form` / `Header` / `Query` / `URI`             | `uri` / `query` / `header` / `cookie` / `json` / `form` / `xml`                   | URI -> Body -> Query -> Header -> Cookie                      | `All` 包含，也可单独绑定   | body 非空且 Content-Type 非空才参与 | All-bind 必须有优先级；本库不默认 All         |
| Chi        | 极简 router          | 无 core binder             | `chi.URLParam`；可选 `render.Bind` body pattern                   | render payload 自定义                                                             | 无通用顺序                                                    | 手动读取                   | `render.Bind` decode body           | build 逃生舱符合 Go 小内核路线                |
| Beego      | 经典 binder          | `Bind` 按 Content-Type     | `BindJSON` / `BindForm` / `BindXML` / `Get*`                      | `json` / form 相关                                                                | `Get*` 中 form 覆盖 query                                     | 手动/框架方法              | 官方偏好显式格式方法                | endpoint body codec 显式更稳                  |
| GoFrame    | 经典 binder / 全栈   | `Request.Parse`            | `Get*Struct`                                                      | `p` / `param` / `params` / `json` 等                                              | 默认 fuzzy matching                                           | 取决于提交参数类型         | `Parse` 聚合并可校验                | 不采用 fuzzy matching，保留显式 request shape |
| Hertz      | 经典 binder / 高性能 | `Bind` / `BindAndValidate` | `BindQuery` / direct accessor                                     | `path` / `form` / `query` / `cookie` / `header` / `json` / `raw_body` / `default` | path -> form -> query -> cookie -> header -> json -> raw_body | 参与聚合但优先级靠后       | JSON/Form 等按请求内容              | 多来源可以存在，但必须显式优先级              |
| Buffalo    | 经典 binder / 全栈   | `Context.Bind`             | 自定义 binder registry                                            | `form` / `json` / `xml`                                                           | 由 binder 决定                                                | 非核心重点                 | 按 Content-Type / Accept 找 binder  | 自定义 binder 映射到 `build`                  |
| Huma       | typed API 校准       | typed input struct         | path/query/header/cookie tags + `Body`/`RawBody`                  | `path` / `query` / `header` / `cookie` / `Body` field                             | 明确区分参数与 body                                           | input struct 可声明 header | `Body` 字段 + contentType           | 证明“整份 request = input struct”方向成立     |

## 推荐的 `@defjs/core` 校准

1. 默认 request construction 只适用于未提供 `build` 的 endpoint：
   - 没有 `build`：按 `struct.request(...)` 的 `path/query/headers/body` sections 构建；
   - 有 `build`：用户完整接管；
   - 不做隐式 merge。

2. request placement 不由字段 tag 驱动：
   - `path` section 生成 path params；
   - `query` section 生成 URL query；
   - `headers` section 生成 headers；
   - `body` section 由 wrapper 生成 body。

3. body codec 由 body wrapper 显式决定：
   - `struct.json(...)`
   - `struct.urlencoded(...)`
   - `struct.formData(...)`
   - `struct.text()`
   - `struct.blob()`
   - `struct.arrayBuffer()`

4. `tag.*(...)` 是 section-local Go-style field tag：
   - 只改 wire key；
   - 不创建第二条 placement channel；
   - 不让同一个字段同时属于多个 request source。

5. Source-specific helper 必须保持薄：
   - internal query params encoder
   - internal path params encoder
   - internal headers encoder
   - internal JSON body encoder
   - internal urlencoded body encoder
   - internal multipart body encoder

6. 不采用 fuzzy default field matching：
   - GoFrame 的设计很方便；
   - 但对 client SDK contract 太隐式。

7. validation 保持分离：
   - transport binding 只决定数据去哪里；
   - 业务 validation 放应用 validator 或 struct validation。

8. transport limit 是 binding contract 的一部分：
   - HTTP 可绑定 uri/query/header/body；
   - SSE 可绑定 uri/query/header，无 body；
   - 浏览器 WebSocket 只可绑定 uri/query。

## `zen-kit` 实施提醒

1. WebSocket default build 不能简单调用 HTTP default build 再靠现有 guard，因为那会先生成 header/body，然后触发失败。它需要 transport-specific filtering 或 transport-aware builder。
2. SSE 在 builder 类型收口前，应先让手写 body 在 definition/runtime validation 阶段报错。
3. Endpoint-level tests 应覆盖：
   - 默认 HTTP `struct.request({ path, query, headers, body })`；
   - 默认 HTTP JSON/urlencoded/formData/text/blob/arrayBuffer body wrapper；
   - 显式 `build` 不 merge request-shaped default build；
   - SSE default build 禁止 body，手写 body 报错；
   - WebSocket default build 只消费 path/query；
   - 非 `struct.request(...)` input 要求显式 `build` 指定 request placement。

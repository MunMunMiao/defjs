---
title: Errors
description: 按 kind 和 code 分支处理 404、超时、未声明状态和传输失败。
---

# Errors

声明过的 404、超时、未声明状态——读错误优先 tuple，别靠 catch。`RequestError` 仍是按 `kind` / `code` 区分的 union，同时也是原生 `Error`（`instanceof Error` 为 true）。先看 `kind`，再看 `code`。

## 基本用法

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({ path: struct.object({ id: struct.number() }) }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ message: struct.string() }),
  },
})

const [error, user, response] = await client.execute(getUser({ path: { id: 7 } }))
if (error?.kind === 'http' && error.status === 404) {
  console.log(error.data.message)
} else if (error?.kind === 'transport' && error.code === 'TIMEOUT') {
  console.log('timed out')
} else if (error?.kind === 'definition' && error.code === 'UNDECLARED_STATUS') {
  console.log('status not in output map', error.response?.status)
} else if (!error) {
  console.log(user.name, response.status)
}
```

```typescript twoslash
import { createTransportError, ERR_ABORTED, type RequestError } from '@defjs/core'

function classify(error: RequestError): string {
  if (error.kind === 'http') return `status:${error.status}`
  if (error.kind === 'transport') return `transport:${error.code}`
  return `definition:${error.code}`
}

const example: RequestError = createTransportError(ERR_ABORTED)
console.log(classify(example))
```

## 稳定 code

| `kind`       | Codes                                                                                                | 含义                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `http`       | `HTTP_STATUS`                                                                                        | 非 2xx 到达了 HTTP 边界。保留 `status`、`response`，以及按状态解码出的 `data`（如有）。 |
| `transport`  | `ABORTED`、`TIMEOUT`、`NETWORK_ERROR`                                                                | 取消、超时，或 Fetch/传输失败挡住了正常结果。                                           |
| `definition` | `REQUEST_VALIDATION_FAILED`、`RESPONSE_VALIDATION_FAILED`、`UNDECLARED_STATUS`、`INTERCEPTOR_FAILED` | 输入、请求构造、响应表示、Struct 解码、状态契约失败，或 interceptor 内部抛错。          |

`cause` 在 transport 和 definition 错误上可选。`response` 在 HTTP status 错误上总有；definition 错误在已有响应时也可能带。

## 按传输的 tuple 形状

```typescript twoslash
import type {
  EventStreamHandle,
  EventStreamOpenInfo,
  HttpResponse,
  RequestError,
  WebSocketConnectionInfo,
  WebSocketSession,
} from '@defjs/core'

type HttpResult =
  | [error: null, data: unknown, response: HttpResponse<unknown>]
  | [error: RequestError, data: undefined, response: HttpResponse<unknown> | undefined]
type SseResult =
  | [error: null, stream: EventStreamHandle<unknown>, open: EventStreamOpenInfo]
  | [error: RequestError, stream: undefined, open: EventStreamOpenInfo | undefined]
type SocketResult =
  | [error: null, session: WebSocketSession<unknown>, connection: WebSocketConnectionInfo]
  | [error: RequestError, session: undefined, connection: WebSocketConnectionInfo | undefined]

const results: [HttpResult, SseResult, SocketResult] | undefined = undefined
void results
```

启动失败 → 第二项 `undefined`。第三项只有传输先产出了响应/快照才会有。SSE handle 或 WebSocket session 返回之后，后续失败走该 handle 的生命周期——不会改写已 settle 的启动 tuple。

## HTTP 状态与 data

精确状态优先。有 `output` 时，Defjs 在解码 body 前就选好匹配 Struct，所以 `error.status` 和 `error.data` 能对上。

| 情况                    | Tuple 结果                       | Body 行为                                                  |
| ----------------------- | -------------------------------- | ---------------------------------------------------------- |
| 2xx 且状态匹配声明      | 成功                             | 选中的 Struct → `data`                                     |
| 非 2xx 且状态匹配声明   | `HTTP_STATUS`                    | 选中的 Struct → 类型化 `error.data`                        |
| 任意状态无匹配声明      | `UNDECLARED_STATUS`              | 状态优先于 body 解码                                       |
| 状态匹配，body 表示失败 | `RESPONSE_VALIDATION_FAILED`     | 没有半成品类型化值                                         |
| 省略 `output`           | 2xx 成功；非 2xx → `HTTP_STATUS` | Body 不解码；`data` 是 `undefined`                         |
| 响应状态 `0`            | 传输错误                         | `response.error` → `NETWORK_ERROR`、`ABORTED` 或 `TIMEOUT` |

`HttpResponse.ok` 只表示 `200 <= status < 300`。正常非 2xx 不会设 `HttpResponse.error`——那个属性留给 Fetch 边界的传输失败或 body 表示失败。

## 启动 vs 打开之后

SSE 在解析 handle 前会校验状态、`text/event-stream` 和 body。失败状态 → `HTTP_STATUS`。坏 content type 或缺 body → `RESPONSE_VALIDATION_FAILED`。打开快照仍可能落在第三项。

WebSocket 启动覆盖握手 + 第一次物理 open。构造失败、打开前关闭、超时或取消 → 启动 tuple。即使 socket 从未到 `open`，连接快照也可能存在。

| 传输      | 启动之后                                                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| SSE       | 致命错误时 iterator reject；`stream.closed` 以 `code: 'error'` 和 `EventStreamErrorCode` resolve                                          |
| WebSocket | 消息/队列/heartbeat/运行时失败走 `onRuntimeError`；终端错误时 `receive` 失败；`session.closed` → `kind: 'error' \| 'aborted' \| 'closed'` |
| HTTP      | Execute promise settle 一次。Interceptor/回调代码仍可能在 tuple 规范化外抛错                                                              |

`ABORTED` / `TIMEOUT` 描述的是调用方看到的启动结果。若已返回 stream/session，你仍要关闭并 await 其终止 promise。

## 原生 Error 日志与 cause

所有 `RequestError` 变体都是原生 `Error` 实例，不再需要诊断适配器。`String(error)` 使用稳定的原生形式 `<name>: <message>`。`kind`、`code` 以及 `status`、`response`、`data` 等变体字段保持可枚举，便于结构化日志；`name` 和原生 `cause` 链不可枚举。

```typescript twoslash
import { StructError, type RequestError } from '@defjs/core'

export function logRequestError(error: RequestError): void {
  console.error(String(error), { code: error.code, kind: error.kind })
  if (error.cause instanceof StructError) {
    console.error(error.cause.prettify())
  }
}
```

调用 `format()`、`flatten()` 或 `prettify()` 前，先用 `error.cause instanceof StructError` 缩窄类型。这些 helper 留在 Struct cause 上，不会复制到外层 `DefinitionError`。别让控制流解析 `message` 或 `String(error)`——契约仍是 `kind`、`code` 和审过的 status。

## 参考

| 分支                  | 控制流检查                                   | 有用的稳定字段                            | 通常缺席 / 敏感             |
| --------------------- | -------------------------------------------- | ----------------------------------------- | --------------------------- |
| HTTP 状态政策         | `error.kind === 'http'`                      | `error.status`、审过的 `error.data`       | Body、headers、URL、`cause` |
| 调用方取消            | `kind === 'transport' && code === 'ABORTED'` | `kind`、`code`                            | Abort reason 和 stack       |
| 超时                  | `kind === 'transport' && code === 'TIMEOUT'` | `kind`、`code`                            | 请求 URL 和底层 cause       |
| 契约失败              | `error.kind === 'definition'`                | `kind`、`code`、审过的 `response?.status` | Struct issues、body、输入值 |
| Stream/session 运行时 | `stream.closed` / `session.closed`           | 终端 code/kind、审过的 close status       | 事件 payload、帧、cause     |

别从状态 `0` 推断 CORS——按 `kind` 和 `code` 分支。

把 `cause`、`data`、响应 headers/body、URL、Struct issues、输入值、stack 当敏感。保守摘要：

```typescript twoslash
import type { RequestError } from '@defjs/core'

export function summarize(error: RequestError): { kind: RequestError['kind']; code: RequestError['code']; status?: number } {
  return {
    kind: error.kind,
    code: error.code,
    status: error.kind === 'http' ? error.status : error.kind === 'definition' ? error.response?.status : undefined,
  }
}
```

`createTransportError`、`createDefinitionError`、`createHttpStatusError` 构造这些原生 Error 值。普通请求失败仍从 tuple 返回；继承原生 Error 并不会让它们自动抛出。`ERR_ABORTED` 和 `ERR_TIMEOUT` 是传输规范化器认识的共享 cause。

## 相关配方

- [声明了 404 的 GET](../recipes/get-declared-404.md)
- [取消一次 HTTP](../recipes/cancel-http.md)

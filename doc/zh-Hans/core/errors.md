---
title: Errors
description: 处理不同 transport 的结果 tuple，并按普通对象形式的 RequestError discriminated union 分支。
---

# Errors

每种受支持的 transport 都返回 error-first 三元素 tuple，但第三项的含义取决于 transport。

```typescript
const [httpError, data, response] = await client.execute(httpCommand)
const [sseError, stream, startupOpen] = await client.execute(sseCommand)
const [socketError, session, startupConnection] = await client.execute(socketCommand)
```

- HTTP 返回解码后的 data 和 Defjs `HttpResponse` wrapper。
- SSE 返回逻辑 stream handle 和启动 open 快照。
- WebSocket 返回逻辑 session 和启动 connection 快照。

失败时，第二项是 `undefined`。如果 transport 在产生对应快照之前就启动失败，第三项也可能是 `undefined`。

## `RequestError`

`RequestError` 是 tuple 中返回的普通 discriminated object，不继承原生 `Error` class。

```typescript
import type { DefinitionError, HttpStatusError, TransportError } from '@defjs/core'

type RequestErrorShape<TErrorData = unknown> = HttpStatusError<TErrorData, number> | TransportError | DefinitionError
```

导出的 union 名称是 `RequestError<TErrorData>`。

先按 `kind` 分支，需要时再按 `code` 分支。

### HTTP Status Error

已声明的非 2xx HTTP response 会产生：

```typescript
interface HttpStatusError<TErrorData = unknown, TStatus extends number = number> {
  kind: 'http'
  code: 'HTTP_STATUS'
  status: TStatus
  message: string
  data: TErrorData
  response: HttpResponse<unknown>
}
```

两个 generic 的顺序是 data 在前、status 在后。宽泛的 `RequestError<TErrorData>` export 仍适合应用边界，而 endpoint execute 会返回按 status 区分的 `HttpStatusError<Data, Status>` union。因此，检查 `error.status` 会把 `error.data` 缩窄到该 status 声明的 body：

```typescript
const [error] = await client.execute(getUser())

if (error?.kind === 'http') {
  if (error.status === 404) {
    console.error(error.data.missing)
  } else {
    // 对该 endpoint，其余 409 | 422 status 共用同一个 conflict body。
    console.error(error.data.conflict)
  }
}
```

只有 `HttpStatusError` 有 `data`。请在 endpoint 边界保留这个与 status 关联的 union，不要把它拓宽成互不关联的 data union。

### Transport Error

网络操作失败、取消或 timeout 会产生：

```typescript
interface TransportError {
  kind: 'transport'
  code: 'ABORTED' | 'NETWORK_ERROR' | 'TIMEOUT'
  message: string
  cause?: unknown
}
```

Transport error 没有 `data` 或 `response` 字段。

### Definition Error

输入解码、请求构建、response 解码或未声明 HTTP status 可能产生：

```typescript
interface DefinitionError {
  kind: 'definition'
  code: 'REQUEST_VALIDATION_FAILED' | 'RESPONSE_VALIDATION_FAILED' | 'UNDECLARED_STATUS'
  message: string
  cause?: unknown
  response?: HttpResponse<unknown>
}
```

| Code                         | 当前触发条件                                                     |
| ---------------------------- | ---------------------------------------------------------------- |
| `REQUEST_VALIDATION_FAILED`  | 输入结构化解码失败、请求构造失败，或 `build` 产生无效 binding。  |
| `RESPONSE_VALIDATION_FAILED` | 已声明的 response 或 SSE 启动 response 未通过结构/content 校验。 |
| `UNDECLARED_STATUS`          | 声明了 `output`，但 HTTP 返回的 status 没有对应 Struct。         |

`UNDECLARED_STATUS` 同时适用于未匹配的 2xx 和非 2xx status。

## 分支处理

```typescript
declare const useUser: (user: unknown) => void

const [error, user, response] = await client.execute(getUser())

if (!error) {
  useUser(user)
} else {
  switch (error.kind) {
    case 'http':
      console.error('HTTP request failed', {
        operation: 'get-user',
        status: error.status,
      })
      break

    case 'transport':
      switch (error.code) {
        case 'ABORTED':
          console.info('get-user cancelled')
          break
        case 'TIMEOUT':
          console.warn('get-user timed out')
          break
        case 'NETWORK_ERROR':
          console.error('get-user transport failed')
          break
      }
      break

    case 'definition':
      console.error('get-user contract failed', {
        code: error.code,
        status: error.response?.status,
      })
      break
  }
}
```

没有明确的脱敏和保留策略时，不要记录 `cause`、`data`、response headers、body 或 URL。

### 原生 `Error` Bridge

部分 integration 要求 throw 原生 `Error`。请在这个边界创建新的 diagnostic error，默认只公开稳定的 `kind`、`code` 和可用的 HTTP `status` 分类：

```typescript
import type { RequestError } from '@defjs/core'

type DiagnosticRequestError = Error & {
  readonly code: RequestError<unknown>['code']
  readonly kind: RequestError<unknown>['kind']
  readonly status: number | undefined
}

export function toDiagnosticError(error: RequestError<unknown>): DiagnosticRequestError {
  const status = error.kind === 'http' ? error.status : error.kind === 'definition' ? error.response?.status : undefined
  const diagnostic = Object.assign(new Error(`Defjs request failed: ${error.kind}/${error.code}`), {
    code: error.code,
    kind: error.kind,
    status,
  })
  diagnostic.name = 'DefjsRequestError'
  return diagnostic
}
```

新建 error 会保留它在边界处生成的自身 stack。这个 bridge 绝不会附加或复制原始 `cause`、cause message、cause stack frame、`data`、response header/body 或 request/response URL。stack frame 文本本身也可能包含 URL 和 secret，因此选取并复制部分 cause frame 并不是安全的默认行为。可运行的 `examples/observability-redacted-logging` 项目会断言保留的 404 status，同时检查 response data 和刻意带有 secret 的 cause stack 没有泄漏。

## Response 可用性

`HttpResponse` 是 Defjs wrapper，不是原生 `Response`。它暴露 status、status text、headers、URL、body、`error` 和 `ok`。`ok` 只表示 status 在 2xx 范围内。`error` 只用于 transport 或 body representation failure；普通非 2xx response 中该字段为空。

合法且已声明的非 2xx body 会经 Struct 解码，并作为 typed `HttpStatusError.data` 保留。Malformed representation 则产生 `RESPONSE_VALIDATION_FAILED`，原始 codec exception 保存在 `cause`，已收到的 response 仍保留，但没有 `data`。

对于 HTTP：

- 已声明的 HTTP status error 有 `error.response`；
- response output 校验错误和未声明 status 可能有 `error.response`；
- 请求校验、收到 response 前的取消、interceptor 抛错和 status-0 transport failure 可能没有 tuple response。

SSE 启动失败时，如果 response 已经到达，随后才发生 content 或 status 校验失败，仍可能返回第三项 open 快照。WebSocket 启动失败时，只有已经捕获 connection 快照才可能返回第三项。

## Error Factory 与常量

Root entry 为集成代码导出以下 factory helper：

```typescript
import { ERR_ABORTED, ERR_TIMEOUT, createDefinitionError, createHttpStatusError, createTransportError } from '@defjs/core'
```

- `createTransportError(cause)`：归一化 abort、timeout 和其他 cause。
- `createDefinitionError(code, cause, response?)`：创建 definition error。
- `createHttpStatusError(status, message, response, data?)`：创建 HTTP status error。
- `ERR_ABORTED` 和 `ERR_TIMEOUT`：normalizer 能识别的共享 `Error` 值。

这些 helper 创建普通 `RequestError` 对象，不会抛出它们。

内置 command 路径会把预期内的启动失败转换成 tuple。Tuple handling 不覆盖任意扩展代码：自定义 interceptor 和应用 callback 仍可能抛错；把不支持的 command 传给宽泛的 runtime implementation 也会 reject。

## 下一步

- [HTTP](/zh-Hans/core/http)：status dispatch 和 response 解码。
- [SSE](/zh-Hans/core/sse)：启动失败与 open 后错误的区别。
- [WebSocket](/zh-Hans/core/web-socket)：runtime error 和终止关闭。

# defjs XSRF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `@defjs/core` 增加一个默认关闭、显式启用、学习 Angular 语义的 XSRF client option，并在 browser runtime 自动注入 token header、在 non-browser runtime 仅通过同步 provider 提供 token。

**Architecture:** 保持现有 `createClient(...options)` 与 `ClientOption` 模型不变，新增 `withXSRF(options?)` 写入 `ClientConfig.xsrf`。请求执行链只负责传播 `xsrf` 配置，最终由 `fetch` transport 统一做 method / same-origin / token 解析与 header 注入。浏览器回归测试不依赖当前跨域的 `testServerHost`，而是用 `window.location.origin` + 自定义 `fetch` stub 验证真实浏览器里的 `document.cookie` 读取与 header 写入。

**Tech Stack:** TypeScript, Bun, Vitest, Vitest Browser (WebdriverIO), Hono

---

## 文件结构

- `packages/core/src/client/config.ts` — 新增 XSRF 公开类型、`ClientOptions.xsrf` 与 `ClientConfig.xsrf`
- `packages/core/src/client/option.ts` — 新增 `withXSRF(options?)`
- `packages/core/src/client/client.ts` — 初始化和克隆 `xsrf` 配置
- `packages/core/src/client/public_api.ts` — 导出 `withXSRF` 与相关类型
- `packages/core/src/internal/http_request.ts` — 为最终请求对象增加 `xsrf` 槽位
- `packages/core/src/http/request.ts` — 把 client 级 `xsrf` 复制到 `HttpRequest`
- `packages/core/src/http/http.ts` — 在执行链里把 `clientConfig.xsrf` 传给 `createHttpRequest`
- `packages/core/src/http/transport/fetch.ts` — 实现 XSRF 判定、token 解析与 header 注入
- `packages/core/src/internal/url.spec.ts` — 补 protocol-relative 输入的 URL 归一化回归测试
- `packages/core/src/client/client.spec.ts` — 覆盖 `withXSRF` 默认值、覆盖值和 `cloneClient` 传播
- `packages/core/src/client/client.type.test.ts` — 覆盖公开类型、同步 provider 约束与 `ClientOptions.xsrf`
- `packages/core/src/http/http.spec.ts` — 覆盖 `HttpRequest.xsrf` 传播
- `packages/core/src/http/transport/fetch.spec.ts` — 覆盖 transport 行为矩阵
- `packages/core/src/http/http.browser.spec.ts` — 覆盖真实浏览器中的 cookie 读取与 same-origin 注入

> 不修改 `packages/core/test-setup.ts`。当前 `inject('testServerHost')` 对 browser tests 来说是跨域 host，不适合做 XSRF 正向回归；正向浏览器回归测试改用 `window.location.origin` 与自定义 `fetch` stub。

---

### Task 1: 暴露 `withXSRF` public API 并把配置挂到 client

**Files:**

- Modify: `packages/core/src/client/config.ts`
- Modify: `packages/core/src/client/option.ts`
- Modify: `packages/core/src/client/client.ts`
- Modify: `packages/core/src/client/public_api.ts`
- Test: `packages/core/src/client/client.spec.ts`
- Test: `packages/core/src/client/client.type.test.ts`

- [ ] **Step 1: 在 `client.spec.ts` 写失败用例，锁定默认值、覆盖值与 clone 行为**

```ts
import { cloneClient, createClient } from './client'
import { getClientConfig } from './resolve'
import { withEndpoint, withXSRF } from './index'

test('should support withXSRF defaults, overrides, and clone propagation', () => {
  const tokenProvider = () => 'server-token'

  const defaults = createClient(withEndpoint('https://api.example.com'), withXSRF())

  expect(getClientConfig(defaults).xsrf).toEqual({
    cookieName: 'XSRF-TOKEN',
    headerName: 'X-XSRF-TOKEN',
    tokenProvider: undefined,
  })

  const configured = createClient(
    withEndpoint('https://api.example.com'),
    withXSRF({
      cookieName: 'CUSTOM-XSRF',
      headerName: 'X-CUSTOM-XSRF',
      tokenProvider,
    }),
  )

  const configuredConfig = getClientConfig(configured)
  expect(configuredConfig.xsrf).toEqual({
    cookieName: 'CUSTOM-XSRF',
    headerName: 'X-CUSTOM-XSRF',
    tokenProvider,
  })

  const cloned = cloneClient(configured)
  expect(getClientConfig(cloned).xsrf).toEqual(configuredConfig.xsrf)
  expect(getClientConfig(cloned).xsrf).not.toBe(configuredConfig.xsrf)

  const overridden = cloneClient(
    configured,
    withXSRF({
      cookieName: 'NEXT-XSRF',
      headerName: 'X-NEXT-XSRF',
    }),
  )

  expect(getClientConfig(overridden).xsrf).toEqual({
    cookieName: 'NEXT-XSRF',
    headerName: 'X-NEXT-XSRF',
    tokenProvider: undefined,
  })
})
```

- [ ] **Step 2: 在 `client.type.test.ts` 写失败用例，锁定公开类型与同步 provider 约束**

```ts
import { type ClientOptions, type ClientXSRFOptions, type XSRFTokenProvider, createClient, withEndpoint, withXSRF } from './index'

const tokenProvider: XSRFTokenProvider = ({ request }) => `${request.method}:${request.endpoint}`

const xsrfOptions = {
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
  tokenProvider,
} satisfies ClientXSRFOptions

createClient(withEndpoint('https://api.example.com'), withXSRF(xsrfOptions))

const options = {
  endpoint: 'https://api.example.com',
  http: { fetch: customFetch },
  interceptors: [],
  queryParamsSerializer: serializer,
  sse: { fetch: customFetch },
  webSocket: {
    WebSocket: MockWebSocket as unknown as typeof WebSocket,
  },
  withCredentials: true,
  xsrf: xsrfOptions,
} satisfies ClientOptions

// @ts-expect-error token providers are synchronous in v1
createClient(withEndpoint('https://api.example.com'), withXSRF({ tokenProvider: async () => 'bad' }))
```

- [ ] **Step 3: 运行 client 层单测和类型测试，确认它们先失败**

Run:

```bash
cd packages/core && bun ../../node_modules/vitest/vitest.mjs run --config vitest.config.bun.ts src/client/client.spec.ts
cd packages/core && bun x vitest run --typecheck --config vitest.config.typecheck.ts src/client/client.type.test.ts
```

Expected:

- `client.spec.ts` 因 `withXSRF` 未导出或 `config.xsrf` 不存在而失败
- `client.type.test.ts` 因缺少 `ClientXSRFOptions` / `XSRFTokenProvider` / `withXSRF` / `ClientOptions.xsrf` 而失败

- [ ] **Step 4: 以最小改动实现 public XSRF 配置面**

在 `packages/core/src/client/config.ts` 增加公开类型和 config 字段：

```ts
import type { HttpRequest } from '../internal/http_request'

export interface XSRFTokenProviderContext {
  request: HttpRequest
}

export type XSRFTokenProvider = (context: XSRFTokenProviderContext) => string | null | undefined

export interface ClientXSRFOptions {
  cookieName?: string
  headerName?: string
  tokenProvider?: XSRFTokenProvider
}

export interface ClientXSRFConfig {
  cookieName: string
  headerName: string
  tokenProvider?: XSRFTokenProvider
}

export interface ClientOptions {
  endpoint: string
  http?: ClientHttpOptions
  interceptors?: Interceptor[]
  queryParamsSerializer?: QueryParamsSerializer
  sse?: ClientSSEOptions
  webSocket?: ClientWebSocketOptions
  withCredentials?: boolean
  xsrf?: ClientXSRFOptions
}

export interface ClientConfig {
  endpoint: string
  http: Required<ClientHttpOptions>
  interceptors: Interceptor[]
  queryParamsSerializer: QueryParamsSerializer
  sse: ClientSSEConfig
  webSocket: ClientWebSocketOptions
  withCredentials?: boolean
  xsrf?: ClientXSRFConfig
}
```

在 `packages/core/src/client/option.ts` 增加 helper：

```ts
import type {
  ClientConfig,
  ClientSSEOptions,
  ClientWebSocketOptions,
  ClientXSRFOptions,
  QueryParamsSerializer,
  SSEInvalidEventHandler,
  SSEQueueOptions,
  SSEReconnectOptions,
  WebSocketBeforeConnect,
  WebSocketHeartbeatOptions,
  WebSocketQueueOptions,
  WebSocketReconnectOptions,
} from './config'

const DEFAULT_XSRF_COOKIE_NAME = 'XSRF-TOKEN'
const DEFAULT_XSRF_HEADER_NAME = 'X-XSRF-TOKEN'

export function withXSRF(options: ClientXSRFOptions = {}): ClientOption {
  return (config) => {
    config.xsrf = {
      cookieName: options.cookieName ?? DEFAULT_XSRF_COOKIE_NAME,
      headerName: options.headerName ?? DEFAULT_XSRF_HEADER_NAME,
      tokenProvider: options.tokenProvider,
    }
  }
}
```

在 `packages/core/src/client/client.ts` 初始化与克隆：

```ts
const conf: ClientConfig = {
  endpoint: '',
  http: { ...DEFAULT_HTTP_OPTIONS },
  interceptors: [],
  queryParamsSerializer: DEFAULT_QUERY_PARAMS_SERIALIZER,
  sse: { ...DEFAULT_SSE_OPTIONS },
  webSocket: {
    WebSocket: globalThis.WebSocket,
    beforeConnect: undefined,
    heartbeat: undefined,
    protocols: undefined,
    queue: undefined,
    reconnect: undefined,
  },
  xsrf: undefined,
}
```

```ts
const conf: ClientConfig = {
  endpoint: prev.endpoint,
  http: { ...prev.http },
  interceptors: [...prev.interceptors],
  queryParamsSerializer: prev.queryParamsSerializer,
  sse: { ...prev.sse },
  webSocket: { ...prev.webSocket },
  withCredentials: prev.withCredentials,
  xsrf: prev.xsrf ? { ...prev.xsrf } : undefined,
}
```

在 `packages/core/src/client/public_api.ts` 导出 helper 与类型：

```ts
export type {
  ClientConfig,
  ClientHttpOptions,
  ClientOptions,
  ClientSSEConfig,
  ClientSSEOptions,
  ClientWebSocketOptions,
  ClientXSRFConfig,
  ClientXSRFOptions,
  QueryParamsSerializer,
  SSEInvalidEventContext,
  SSEInvalidEventHandler,
  SSEInvalidEventMessage,
  SSEInvalidEventReason,
  SSEQueueOptions,
  SSEReconnectOptions,
  WebSocketBeforeConnect,
  WebSocketHeartbeatOptions,
  WebSocketQueueOptions,
  WebSocketReconnectOptions,
  XSRFTokenProvider,
  XSRFTokenProviderContext,
} from './config'

export {
  withCredentials,
  withEndpoint,
  withHTTPHandle,
  withInterceptors,
  withQueryParamsSerializer,
  withSSEHandle,
  withSSEOnInvalidEvent,
  withSSEOptions,
  withSSEQueue,
  withSSEReconnect,
  withWebSocketBeforeConnect,
  withWebSocketHandle,
  withWebSocketHeartbeat,
  withWebSocketOptions,
  withWebSocketProtocols,
  withWebSocketQueue,
  withWebSocketReconnect,
  withXSRF,
} from './option'
```

- [ ] **Step 5: 重新运行 client 单测和类型测试，确认通过**

Run:

```bash
cd packages/core && bun ../../node_modules/vitest/vitest.mjs run --config vitest.config.bun.ts src/client/client.spec.ts
cd packages/core && bun x vitest run --typecheck --config vitest.config.typecheck.ts src/client/client.type.test.ts
```

Expected:

- 两条命令均 PASS
- `client.spec.ts` 覆盖默认值、覆盖值和 clone 传播
- `client.type.test.ts` 覆盖 `ClientOptions.xsrf` 与同步 provider 约束

- [ ] **Step 6: 提交 public API 改动**

```bash
git add packages/core/src/client/config.ts packages/core/src/client/option.ts packages/core/src/client/client.ts packages/core/src/client/public_api.ts packages/core/src/client/client.spec.ts packages/core/src/client/client.type.test.ts
git commit -m "feat(core): add xsrf client option surface"
```

---

### Task 2: 把 XSRF 配置从 client 传播到 `HttpRequest`

**Files:**

- Modify: `packages/core/src/internal/http_request.ts`
- Modify: `packages/core/src/http/request.ts`
- Modify: `packages/core/src/http/http.ts`
- Test: `packages/core/src/http/http.spec.ts`

- [ ] **Step 1: 在 `http.spec.ts` 写失败用例，锁定 `HttpRequest.xsrf` 传播**

```ts
import { createClient, withEndpoint, withInterceptors, withXSRF } from '../client'
import { createHttpInterceptor } from '../interceptor'
import { makeResponse } from '../internal/http_response'
import { struct } from '../struct'
import type { HttpRequest } from './index'
import { defineRequest } from './index'

test('should carry client xsrf config into the final HttpRequest', async () => {
  let capturedRequest: HttpRequest | undefined

  const client = createClient(
    withEndpoint('https://example.com'),
    withXSRF({
      cookieName: 'CUSTOM-XSRF',
      headerName: 'X-CUSTOM-XSRF',
    }),
    withInterceptors(
      createHttpInterceptor(async (request) => {
        capturedRequest = request as HttpRequest
        return makeResponse({
          body: { ok: true },
          status: 200,
        })
      }),
    ),
  )

  const useInspect = defineRequest({
    method: 'POST',
    output: {
      200: struct.object({ ok: struct.boolean() }),
    },
    path: '/inspect-xsrf',
  })

  const [error, result] = await useInspect().with({ client })

  expect(error).toBeNull()
  expect(result).toEqual({ ok: true })
  expect(capturedRequest?.xsrf).toEqual({
    cookieName: 'CUSTOM-XSRF',
    headerName: 'X-CUSTOM-XSRF',
    tokenProvider: undefined,
  })
})
```

- [ ] **Step 2: 运行 request runtime 单测，确认它先失败**

Run:

```bash
cd packages/core && bun ../../node_modules/vitest/vitest.mjs run --config vitest.config.bun.ts src/http/http.spec.ts
```

Expected:

- 因 `HttpRequest` 上没有 `xsrf` 字段或执行链未传递 `clientConfig.xsrf` 而失败

- [ ] **Step 3: 最小实现 request 传播链**

在 `packages/core/src/internal/http_request.ts` 增加字段：

```ts
import type { ClientXSRFConfig } from '../client/config'

export interface HttpRequest {
  abort?: AbortSignal
  baseEndpoint?: string
  body?: Blob | ArrayBuffer | FormData | URLSearchParams | ReadableStream<Uint8Array> | object | string | number | boolean | null
  bodyContentType?: string | null
  bodyContentTypeSource?: unknown
  context?: HttpContext
  downloadProgress?: HttpProgressFn
  endpoint: string
  headers?: Headers
  method: string
  queryParams?: URLSearchParams
  queryString?: string
  responseType?: HttpResponseType
  timeout?: number
  uploadProgress?: HttpProgressFn
  withCredentials?: boolean
  xsrf?: ClientXSRFConfig
}
```

在 `packages/core/src/http/request.ts` 把 `xsrf` 纳入选项与结果：

```ts
import { DEFAULT_QUERY_PARAMS_SERIALIZER, type ClientXSRFConfig, type QueryParamsSerializer } from '../client/config'

export function createHttpRequest<TInput>(
  method: string,
  path: string,
  input: TInput,
  build: ((request: RequestBuilder, input: TInput) => void) | undefined,
  options: {
    abort: AbortSignal
    baseEndpoint: string
    context?: HttpContext
    downloadProgress?: HttpProgressFn
    input?: AnyStruct
    queryParamsSerializer: QueryParamsSerializer
    responseType?: HttpResponseType
    timeout?: number
    uploadProgress?: HttpProgressFn
    withCredentials?: boolean
    xsrf?: ClientXSRFConfig
  },
): HttpRequest {
  const built = buildRequest(input, build as ((request: RequestBuilder, input: unknown) => void) | undefined, {
    input: options.input,
    transport: 'http',
  })
  const allowComplexQuery = options.queryParamsSerializer !== DEFAULT_QUERY_PARAMS_SERIALIZER
  const queryParams = createSearchParams(built.query, { allowComplex: allowComplexQuery })
  const headers = new Headers()

  appendRecordToHeaders(headers, built.headers)

  const request: HttpRequest = {
    abort: options.abort,
    baseEndpoint: options.baseEndpoint,
    body: built.body,
    bodyContentType: built.bodyContentType,
    bodyContentTypeSource: built.body,
    context: options.context,
    downloadProgress: options.downloadProgress,
    endpoint: fillUrl(path, built.params),
    headers,
    method,
    queryParams,
    queryString: options.queryParamsSerializer(queryParams, built.query),
    responseType: options.responseType,
    timeout: options.timeout,
    uploadProgress: options.uploadProgress,
    withCredentials: options.withCredentials ?? false,
    xsrf: options.xsrf,
  }

  applyRequestContentType(request, headers)
  return request
}
```

在 `packages/core/src/http/http.ts` 把 client config 传给 `createHttpRequest`：

```ts
request = createHttpRequest(
  endpoint.method,
  endpoint.path,
  parsedInput,
  endpoint.build as ((request: RequestBuilder, input: unknown) => void) | undefined,
  {
    abort: mergeAbortSignals(controller.signal, [config.abort], config.timeout),
    baseEndpoint: clientConfig.endpoint,
    context: config.context,
    downloadProgress: config.onDownloadProgress,
    input: endpoint.input,
    queryParamsSerializer: clientConfig.queryParamsSerializer,
    responseType,
    timeout: config.timeout,
    uploadProgress: config.onUploadProgress,
    withCredentials: clientConfig.withCredentials,
    xsrf: clientConfig.xsrf,
  },
)
```

- [ ] **Step 4: 重新运行 request runtime 单测，确认通过**

Run:

```bash
cd packages/core && bun ../../node_modules/vitest/vitest.mjs run --config vitest.config.bun.ts src/http/http.spec.ts
```

Expected:

- PASS
- 新增用例能看到 `capturedRequest.xsrf`

- [ ] **Step 5: 提交 request 传播改动**

```bash
git add packages/core/src/internal/http_request.ts packages/core/src/http/request.ts packages/core/src/http/http.ts packages/core/src/http/http.spec.ts
git commit -m "feat(core): thread xsrf config into http requests"
```

---

### Task 3: 在 `fetch` transport 实现 Angular 风格 XSRF 注入，并补单测与浏览器回归

**Files:**

- Modify: `packages/core/src/http/transport/fetch.ts`
- Test: `packages/core/src/http/transport/fetch.spec.ts`
- Test: `packages/core/src/http/http.browser.spec.ts`
- Test: `packages/core/src/internal/url.spec.ts`

- [ ] **Step 1: 在 `internal/url.spec.ts` 加 protocol-relative 回归断言**

```ts
expect(() => createResolvedRequestUrl('https://api.example.com/v1', '//evil.example.com/user')).toThrowError(
  'Endpoint path must not be an absolute URL',
)
```

- [ ] **Step 2: 在 `fetch.spec.ts` 写失败用例，锁定 transport 行为矩阵**

```ts
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { HttpRequest } from '../../http'
import {
  __resetStreamingRequestBodySupportForTests,
  createFetchRequest,
  createFetchRequestInit,
  ERR_STREAMING_REQUEST_UNSUPPORTED,
  fetchHandler,
  supportsStreamingRequestBody,
} from './fetch'

afterEach(() => {
  vi.unstubAllGlobals()
  __resetStreamingRequestBodySupportForTests()
})

describe('Fetch handler request creation', () => {
  test('should inject xsrf header for mutating same-origin requests', () => {
    vi.stubGlobal('document', { cookie: 'XSRF-TOKEN=abc123; theme=dark' } as Document)
    vi.stubGlobal('location', { origin: 'https://example.com' } as Location)

    const init = createFetchRequestInit({
      baseEndpoint: 'https://example.com',
      endpoint: '/v1/user',
      method: 'POST',
      xsrf: {
        cookieName: 'XSRF-TOKEN',
        headerName: 'X-XSRF-TOKEN',
      },
    } as HttpRequest)

    expect((init.headers as Headers).get('x-xsrf-token')).toBe('abc123')
  })

  test.each(['GET', 'HEAD'] as const)('should not inject xsrf header for %s requests', (method) => {
    vi.stubGlobal('document', { cookie: 'XSRF-TOKEN=abc123' } as Document)
    vi.stubGlobal('location', { origin: 'https://example.com' } as Location)

    const init = createFetchRequestInit({
      baseEndpoint: 'https://example.com',
      endpoint: '/v1/user',
      method,
      xsrf: {
        cookieName: 'XSRF-TOKEN',
        headerName: 'X-XSRF-TOKEN',
      },
    } as HttpRequest)

    expect((init.headers as Headers).has('x-xsrf-token')).toBe(false)
  })

  test('should not inject xsrf header for cross-origin requests', () => {
    vi.stubGlobal('document', { cookie: 'XSRF-TOKEN=abc123' } as Document)
    vi.stubGlobal('location', { origin: 'https://app.example.com' } as Location)

    const init = createFetchRequestInit({
      baseEndpoint: 'https://api.example.com',
      endpoint: '/v1/user',
      method: 'POST',
      xsrf: {
        cookieName: 'XSRF-TOKEN',
        headerName: 'X-XSRF-TOKEN',
      },
    } as HttpRequest)

    expect((init.headers as Headers).has('x-xsrf-token')).toBe(false)
  })

  test('should prefer provider over browser cookie and keep withCredentials independent', () => {
    vi.stubGlobal('document', { cookie: 'XSRF-TOKEN=cookie-token' } as Document)
    vi.stubGlobal('location', { origin: 'https://example.com' } as Location)

    const init = createFetchRequestInit({
      baseEndpoint: 'https://example.com',
      endpoint: '/v1/user',
      method: 'POST',
      withCredentials: false,
      xsrf: {
        cookieName: 'XSRF-TOKEN',
        headerName: 'X-XSRF-TOKEN',
        tokenProvider: () => 'provider-token',
      },
    } as HttpRequest)

    expect((init.headers as Headers).get('x-xsrf-token')).toBe('provider-token')
    expect(init.credentials).toBeUndefined()
  })

  test('should not overwrite an existing xsrf header', () => {
    vi.stubGlobal('document', { cookie: 'XSRF-TOKEN=abc123' } as Document)
    vi.stubGlobal('location', { origin: 'https://example.com' } as Location)

    const init = createFetchRequestInit({
      baseEndpoint: 'https://example.com',
      endpoint: '/v1/user',
      method: 'POST',
      headers: new Headers([['X-XSRF-TOKEN', 'manual-token']]),
      xsrf: {
        cookieName: 'XSRF-TOKEN',
        headerName: 'X-XSRF-TOKEN',
      },
    } as HttpRequest)

    expect((init.headers as Headers).get('x-xsrf-token')).toBe('manual-token')
  })

  test('should use provider outside browser runtime and skip when provider is missing', () => {
    const withProvider = createFetchRequestInit({
      baseEndpoint: 'https://api.example.com',
      endpoint: '/v1/user',
      method: 'POST',
      xsrf: {
        cookieName: 'XSRF-TOKEN',
        headerName: 'X-XSRF-TOKEN',
        tokenProvider: () => 'server-token',
      },
    } as HttpRequest)

    const withoutProvider = createFetchRequestInit({
      baseEndpoint: 'https://api.example.com',
      endpoint: '/v1/user',
      method: 'POST',
      xsrf: {
        cookieName: 'XSRF-TOKEN',
        headerName: 'X-XSRF-TOKEN',
      },
    } as HttpRequest)

    expect((withProvider.headers as Headers).get('x-xsrf-token')).toBe('server-token')
    expect((withoutProvider.headers as Headers).has('x-xsrf-token')).toBe(false)
  })
})
```

- [ ] **Step 3: 在 `http.browser.spec.ts` 写失败用例，锁定真实浏览器里的 cookie 读取与 same-origin 注入**

```ts
import { expect, test, vi } from 'vitest'
import { createClient, withEndpoint, withHTTPHandle, withXSRF } from '../client'
import { defineRequest } from './index'

test('should inject xsrf header from document.cookie in real browsers', async () => {
  document.cookie = 'XSRF-TOKEN=browser-token; path=/'

  let captured: Request | undefined
  const fetchStub = vi.fn(async (input) => {
    captured = input as Request
    return new Response(null, { status: 200 })
  }) as unknown as typeof fetch

  const client = createClient(withEndpoint(window.location.origin), withHTTPHandle(fetchStub), withXSRF())

  const usePost = defineRequest({
    method: 'POST',
    path: '/xsrf-browser',
  })

  const [error, result, response] = await usePost().with({ client })

  expect(error).toBeNull()
  expect(result).toBeUndefined()
  expect(response?.ok).toBe(true)
  expect(captured?.headers.get('x-xsrf-token')).toBe('browser-token')

  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
})
```

- [ ] **Step 4: 运行 transport 单测与 browser 回归测试，确认它们先失败**

Run:

```bash
cd packages/core && bun ../../node_modules/vitest/vitest.mjs run --config vitest.config.bun.ts src/http/transport/fetch.spec.ts src/internal/url.spec.ts
cd packages/core && bun x vitest run --config vitest.config.browser.chrome.ts src/http/http.browser.spec.ts
```

Expected:

- `fetch.spec.ts` 因 header 尚未注入而失败
- `http.browser.spec.ts` 因真实浏览器请求里没有 `X-XSRF-TOKEN` header 而失败
- `url.spec.ts` 只要已有 `normalizeEndpointPath()` 行为不退化就应继续 PASS

- [ ] **Step 5: 以最小改动实现 transport XSRF 逻辑**

在 `packages/core/src/http/transport/fetch.ts` 增加 helper，并在 `createFetchRequestInit()` 里调用：

```ts
const XSRF_MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function isMutatingMethod(method: string): boolean {
  return XSRF_MUTATING_METHODS.has(method.toUpperCase())
}

function isBrowserRuntime(): boolean {
  return typeof document !== 'undefined' && typeof location !== 'undefined'
}

function readBrowserXSRFCookie(name: string): string | undefined {
  if (!isBrowserRuntime() || document.cookie === '') {
    return undefined
  }

  for (const part of document.cookie.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=')
    if (rawName === name) {
      return decodeURIComponent(rawValue.join('='))
    }
  }

  return undefined
}

function isSameOriginRequest(request: HttpRequest): boolean {
  if (typeof location === 'undefined') {
    return true
  }

  return resolveRequestUrl(request).origin === location.origin
}

function resolveXSRFToken(request: HttpRequest): string | undefined {
  const xsrf = request.xsrf
  if (!xsrf) {
    return undefined
  }

  if (xsrf.tokenProvider) {
    return xsrf.tokenProvider({ request }) ?? undefined
  }

  if (!isBrowserRuntime()) {
    return undefined
  }

  return readBrowserXSRFCookie(xsrf.cookieName)
}

function applyXSRFHeaderIfNeeded(request: HttpRequest, headers: Headers): void {
  const xsrf = request.xsrf
  if (!xsrf) {
    return
  }

  if (!isMutatingMethod(request.method)) {
    return
  }

  if (headers.has(xsrf.headerName)) {
    return
  }

  if (!isSameOriginRequest(request)) {
    return
  }

  const token = resolveXSRFToken(request)
  if (!token) {
    return
  }

  headers.set(xsrf.headerName, token)
}

export function createFetchRequestInit(request: HttpRequest): RequestInitWithDuplex {
  const headers = new Headers(request.headers)
  applyRequestContentType(request, headers)
  applyXSRFHeaderIfNeeded(request, headers)

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json, text/plain, */*')
  }

  const credentials = request.withCredentials ? 'include' : undefined
  let body = serializeHttpBody(request.body)
  const init: RequestInitWithDuplex = {
    headers,
    method: request.method,
    body,
    signal: request.abort,
    credentials,
  }

  if (isReadableStreamBody(body)) {
    if (!supportsStreamingRequestBody()) {
      throw ERR_STREAMING_REQUEST_UNSUPPORTED
    }

    if (request.uploadProgress) {
      body = wrapUploadProgressStream(body, request.uploadProgress, getContentLength(headers))
      init.body = body
    }

    init.duplex = 'half'
  }

  return init
}
```

- [ ] **Step 6: 重新运行 transport 单测与 browser 回归测试，确认通过**

Run:

```bash
cd packages/core && bun ../../node_modules/vitest/vitest.mjs run --config vitest.config.bun.ts src/http/transport/fetch.spec.ts src/internal/url.spec.ts
cd packages/core && bun x vitest run --config vitest.config.browser.chrome.ts src/http/http.browser.spec.ts
```

Expected:

- 两条命令均 PASS
- `fetch.spec.ts` 覆盖 method、same-origin、provider 优先级、header 不覆盖和 `withCredentials` 独立性
- `http.browser.spec.ts` 在真实浏览器环境中验证 `document.cookie` → `X-XSRF-TOKEN`
- `url.spec.ts` 继续锁住 protocol-relative 输入拒绝

- [ ] **Step 7: 提交 transport 与浏览器回归改动**

```bash
git add packages/core/src/http/transport/fetch.ts packages/core/src/http/transport/fetch.spec.ts packages/core/src/http/http.browser.spec.ts packages/core/src/internal/url.spec.ts
git commit -m "feat(core): inject xsrf headers in fetch transport"
```

---

### Task 4: 运行聚焦验证，确保 API、传播链和浏览器回归一起成立

**Files:**

- Verify only: `packages/core/src/client/client.spec.ts`
- Verify only: `packages/core/src/client/client.type.test.ts`
- Verify only: `packages/core/src/http/http.spec.ts`
- Verify only: `packages/core/src/http/transport/fetch.spec.ts`
- Verify only: `packages/core/src/http/http.browser.spec.ts`
- Verify only: `packages/core/src/internal/url.spec.ts`

- [ ] **Step 1: 运行聚焦的 Bun 单测**

Run:

```bash
cd packages/core && bun ../../node_modules/vitest/vitest.mjs run --config vitest.config.bun.ts src/client/client.spec.ts src/http/http.spec.ts src/http/transport/fetch.spec.ts src/internal/url.spec.ts
```

Expected:

- PASS
- client 配置、request 传播、transport 行为与 URL 归一化回归一起通过

- [ ] **Step 2: 运行聚焦的类型测试**

Run:

```bash
cd packages/core && bun x vitest run --typecheck --config vitest.config.typecheck.ts src/client/client.type.test.ts
```

Expected:

- PASS
- 同步 provider 约束和公开类型导出齐全

- [ ] **Step 3: 运行聚焦的 browser 回归测试**

Run:

```bash
cd packages/core && bun x vitest run --config vitest.config.browser.chrome.ts src/http/http.browser.spec.ts
```

Expected:

- PASS
- 真实浏览器用例里能读到 `document.cookie` 并写出 `X-XSRF-TOKEN`

- [ ] **Step 4: 如全部通过，记录最终验证结果并准备进入下一阶段**

```bash
git status --short
```

Expected:

- 只看到本计划涉及的 source / test 文件改动
- 没有额外的调试文件或无关变更

---

## 计划自查

- 规格里的 public API、runtime 行为矩阵、内部数据流、same-origin 固定策略、`withCredentials` 独立性、同步 provider 约束、URL 归一化回归和测试矩阵都已分别映射到 Task 1–4。
- 计划没有引入 SSE / WebSocket 范围外改动。
- 浏览器正向回归测试明确避开了当前跨域 `testServerHost`，避免实现者在错误测试设施上浪费时间。

## 执行前提示

- `ClientOptions` 是公开类型，虽然 `createClient` 不直接接收它，但仍需把 `xsrf?: ClientXSRFOptions` 补进去，保持公开类型面一致。
- `HttpRequest.endpoint` 经过 `fillUrl()` 后仍然是 path；same-origin 判定应基于 `resolveRequestUrl(request)` 与 `location.origin` 比较，而不是把 endpoint 当成可直接传入的 absolute URL。
- `XSRFTokenProvider` 第一版必须保持同步，避免把当前同步的 `createFetchRequestInit()` / `createFetchRequest()` 链路改成异步。

## 参考与对齐

- [Angular security guide](https://angular.dev/best-practices/security)
- [Angular `withXsrfConfiguration`](https://angular.dev/api/common/http/withXsrfConfiguration)
- [Angular `withNoXsrfProtection`](https://angular.dev/api/common/http/withNoXsrfProtection)
- [Angular `xsrf.ts` source](https://github.com/angular/angular/blob/main/packages/common/http/src/xsrf.ts)
- [Angular XSRF security advisory GHSA-58c5-g7wp-6w37](https://github.com/angular/angular/security/advisories/GHSA-58c5-g7wp-6w37)
- [OWASP Cross-Site Request Forgery Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [MDN Request.credentials](https://developer.mozilla.org/en-US/docs/Web/API/Request/credentials)
- [MDN same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy)

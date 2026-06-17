import re, os

BASE = "/Users/munmunmiao/Documents/web/zen-kit/doc"

# --- English reference content for migration.md (already read, we will use structure) ---
# We will manually craft each language's migration.md based on the English version,
# preserving the target language prose and removing all old version references.

# For zh-Hans migration.md:
zh_hans_migration = """---
title: Breaking Changes
description: 与其他 HTTP 库常见模式不同的 API 设计决策。
---

# Breaking Changes

Defjs 在某些设计决策上故意与其他 HTTP 库的常见模式不同。本文档解释每个决策背后的设计原理。

## 无全局客户端

Defjs 不提供全局单例客户端。你必须显式创建并传递 `Client` 实例。

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
)

const [error, data] = await client.execute(getUser())
```

为何这样设计：

- **测试友好**：测试之间无需重置或模拟全局状态。直接传递不同的 `Client` 实例。
- **多环境共存**：同一进程可以并行运行多个客户端（例如内部 API + 公共 API），互不干扰。
- **依赖透明**：调用方必须显式持有 `Client`，使依赖关系对静态分析和代码审查可见。

如果你需要“默认”的便捷方式，请在应用层封装：

```typescript
// api/client.ts
import { createClient, withEndpoint } from '@defjs/core'

export const apiClient = createClient(
  withEndpoint(import.meta.env.VITE_API_ENDPOINT),
)
```

## 无框架全局 Provider

`@defjs/angular` 和 `@defjs/vue` 不提供全局客户端 Provider。请使用 `provideClient` + `injectClient` 在框架依赖注入系统中注册和访问客户端。

### Angular

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/angular'

export const appConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}

export class UserComponent {
  private client = injectClient()

  async loadUser() {
    const [error, user] = await this.client.execute(this.getUser())
  }
}
```

### Vue

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/vue'

app.use(provideClient(withEndpoint('https://api.example.com')))

const client = injectClient()
const [error, user] = await client.execute(getUser())
```

## 请求级选项传给 `execute`，而非 Builder

请求级选项（`abort`、`timeout`、`heartbeat`、`reconnect` 等）通过 `client.execute` 的第二个参数传入，而非命令构建器。

```typescript
// 正确：请求级选项传给 execute
const [error, user] = await client.execute(getUser(), { timeout: 5000 })
```

## `execute` 按命令类型重载

`client.execute` 根据 `Command` 类型自动返回正确的结果类型。

```typescript
// HTTP 请求 — 返回 HttpAwaitResult
const [error, user, response] = await client.execute(httpCommand())

// SSE 流 — 返回 StreamAwaitResult
const [error, stream, open] = await client.execute(sseCommand())

// WebSocket — 返回 SocketAwaitResult
const [error, socket, connection] = await client.execute(wsCommand())
```

## `onInvalidEvent` 是观察者

SSE 的 `onInvalidEvent` 是观察者。内部抛出的异常会被静默忽略，不会中断流。

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
      // 即使这里抛出异常，流也会继续
    },
  },
})
```

## 错误子模块合并

所有错误符号都从 `@defjs/core` 主入口导出。

| 导出 | 说明 | 典型用法 |
|--------|-------------|---------------|
| `RequestError` | 错误联合类型 | `switch (error.kind)` 分支 |
| `ERR_ABORTED` | 中止标识 | `controller.abort(ERR_ABORTED)` |
| `ERR_TIMEOUT` | 超时标识 | `createTransportError(ERR_TIMEOUT)` |
| `createTransportError` | 创建传输错误 | `createTransportError(new Error('offline'))` |
| `createDefinitionError` | 创建定义错误 | `createDefinitionError('REQUEST_VALIDATION_FAILED', cause)` |
| `createHttpStatusError` | 创建 HTTP 状态错误 | `createHttpStatusError(404, 'Not Found', response, data)` |

从主入口导入：

```typescript
import {
  RequestError,
  ERR_ABORTED,
  ERR_TIMEOUT,
  createTransportError,
  createDefinitionError,
  createHttpStatusError,
} from '@defjs/core'
```

## 按 `kind` 和 `code` 进行错误分支

Defjs 建议通过 `kind` 和 `code` 进行分支，而不是字符串比较。

```typescript
const [error, user] = await client.execute(getUser())

if (error) {
  switch (error.kind) {
    case 'http': {
      console.error('HTTP', error.status, error.message)
      if (error.status === 404) {
        console.error('Not found:', error.data.code)
      }
      break
    }
    case 'transport': {
      switch (error.code) {
        case 'ABORTED':
          console.error('Request aborted')
          break
        case 'TIMEOUT':
          console.error('Request timed out')
          break
        case 'NETWORK_ERROR':
          console.error('Network error:', error.cause)
          break
      }
      break
    }
    case 'definition': {
      switch (error.code) {
        case 'REQUEST_VALIDATION_FAILED':
          console.error('Request validation failed:', error.cause)
          break
        case 'RESPONSE_VALIDATION_FAILED':
          console.error('Response validation failed:', error.cause)
          break
        case 'UNDECLARED_STATUS':
          console.error('Undeclared status:', error.response?.status)
          break
      }
      break
    }
  }
}
```

## API 重命名

部分 API 名称已标准化，以提高清晰度：

| 旧 API | 新 API | 说明 |
|---------|---------|------|
| `withSseOptions` | `withSSEOptions` | SSE 配置辅助函数，命名标准化为大写缩写 |
| `createGlobalClient` | `createClient` | 创建客户端；不再使用全局单例 |
| `getGlobalClient` | — | 已移除；使用显式客户端实例 |
| `setGlobalClient` | — | 已移除；使用显式客户端实例 |
| `resetGlobalClient` | — | 已移除；使用显式客户端实例 |
| `cloneClient` | `createClient(...)` | 通过创建新实例来克隆 |
| `provideGlobalClient` | `provideClient` | Angular/Vue Provider，统一命名 |

## 更严格的端点定义规则

Defjs 强制执行一条严格规则：**当提供 `build` 时，必须同时提供 `input`。**

```typescript
// 正确：同时提供 input 和 build
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.object({
    path: struct.object({ id: struct.number() }),
  }),
  build(request, input) {
    request.setPathParams({ id: input.path.id })
  },
  output: { 200: struct.object({ id: struct.number(), name: struct.string() }) },
})

// 正确：不提供 input 和 build
const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
  output: { 200: struct.object({ items: struct.array(struct.object({ id: struct.number() })) }) },
})

// 错误：提供 build 但没有 input
const badRequest = defineRequest({
  method: 'GET',
  path: '/users/:id',
  build(request, input) {
    request.setPathParams({ id: input.id }) // TypeScript 错误：缺少 input 结构
  },
  output: { 200: struct.object({ id: struct.number() }) },
})
```

此规则同样适用于 `defineEventStream` 和 `defineWebSocket`。

## 版本兼容性

| 包 | 兼容版本 |
|---------|-------------------|
| `@defjs/core` | `^0.4.0` |
| `@defjs/angular` | `19.x` |
| `@defjs/vue` | `^0.4.0` |

Angular 的 peer dependency 范围：`>=18.0.0 <=22.0.0`。Node 运行时：`>=26`。

## 下一步

- [客户端 →](/core/client) — 显式客户端设计和配置
- [命令 →](/core/commands) — 命令定义和输入规则
- [错误 →](/core/errors) — `RequestError` 结构和分支
"""

# For zh-Hant migration.md:
zh_hant_migration = """---
title: Breaking Changes
description: 與其他 HTTP 函式庫常見模式不同的 API 設計決策。
---

# Breaking Changes

Defjs 在某些設計決策上故意與其他 HTTP 函式庫的常見模式不同。本文件解釋每個決策背後的設計原理。

## 無全域用戶端

Defjs 不提供全域單例用戶端。你必須顯式建立並傳遞 `Client` 執行個體。

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
)

const [error, data] = await client.execute(getUser())
```

為何這樣設計：

- **測試友好**：測試之間無需重置或模擬全域狀態。直接傳入不同的 `Client` 執行個體。
- **多環境共存**：同一程序中可以並行執行多個用戶端（例如內部 API + 公開 API），互不干擾。
- **依賴透明**：呼叫方必須顯式持有 `Client`，使依賴關係對靜態分析和程式碼審查可見。

如果你需要「預設」的便捷方式，請在應用層封裝：

```typescript
// api/client.ts
import { createClient, withEndpoint } from '@defjs/core'

export const apiClient = createClient(
  withEndpoint(import.meta.env.VITE_API_ENDPOINT),
)
```

## 無框架全域 Provider

`@defjs/angular` 和 `@defjs/vue` 不提供全域用戶端 Provider。請使用 `provideClient` + `injectClient` 在框架相依性注入系統中註冊和存取用戶端。

### Angular

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/angular'

export const appConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}

export class UserComponent {
  private client = injectClient()

  async loadUser() {
    const [error, user] = await this.client.execute(this.getUser())
  }
}
```

### Vue

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/vue'

app.use(provideClient(withEndpoint('https://api.example.com')))

const client = injectClient()
const [error, user] = await client.execute(getUser())
```

## 請求級選項傳給 `execute`，而非 Builder

請求級選項（`abort`、`timeout`、`heartbeat`、`reconnect` 等）透過 `client.execute` 的第二個引數傳入，而非指令建構器。

```typescript
// 正確：請求級選項傳給 execute
const [error, user] = await client.execute(getUser(), { timeout: 5000 })
```

## `execute` 按指令型別多載

`client.execute` 會根據 `Command` 型別自動回傳正確的結果型別。

```typescript
// HTTP 請求 — 回傳 HttpAwaitResult
const [error, user, response] = await client.execute(httpCommand())

// SSE 串流 — 回傳 StreamAwaitResult
const [error, stream, open] = await client.execute(sseCommand())

// WebSocket — 回傳 SocketAwaitResult
const [error, socket, connection] = await client.execute(wsCommand())
```

## `onInvalidEvent` 是觀察者

SSE 的 `onInvalidEvent` 是觀察者。其內部拋出的例外會被靜默忽略，不會中斷串流。

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
      // 即使這裡拋出例外，串流仍會繼續
    },
  },
})
```

## 錯誤子模組合併

所有錯誤符號都從 `@defjs/core` 主入口匯出。

| 匯出 | 說明 | 典型用法 |
|------|-------------|---------------|
| `RequestError` | 錯誤聯合型別 | `switch (error.kind)` 分支 |
| `ERR_ABORTED` | 取消識別符 | `controller.abort(ERR_ABORTED)` |
| `ERR_TIMEOUT` | 逾時識別符 | `createTransportError(ERR_TIMEOUT)` |
| `createTransportError` | 建立傳輸錯誤 | `createTransportError(new Error('offline'))` |
| `createDefinitionError` | 建立定義錯誤 | `createDefinitionError('REQUEST_VALIDATION_FAILED', cause)` |
| `createHttpStatusError` | 建立 HTTP 狀態錯誤 | `createHttpStatusError(404, 'Not Found', response, data)` |

從主入口匯入：

```typescript
import {
  RequestError,
  ERR_ABORTED,
  ERR_TIMEOUT,
  createTransportError,
  createDefinitionError,
  createHttpStatusError,
} from '@defjs/core'
```

## 按 `kind` 和 `code` 進行錯誤分支

Defjs 建議透過 `kind` 和 `code` 進行分支，而非字串比對。

```typescript
const [error, user] = await client.execute(getUser())

if (error) {
  switch (error.kind) {
    case 'http': {
      console.error('HTTP', error.status, error.message)
      if (error.status === 404) {
        console.error('Not found:', error.data.code)
      }
      break
    }
    case 'transport': {
      switch (error.code) {
        case 'ABORTED':
          console.error('Request aborted')
          break
        case 'TIMEOUT':
          console.error('Request timed out')
          break
        case 'NETWORK_ERROR':
          console.error('Network error:', error.cause)
          break
      }
      break
    }
    case 'definition': {
      switch (error.code) {
        case 'REQUEST_VALIDATION_FAILED':
          console.error('Request validation failed:', error.cause)
          break
        case 'RESPONSE_VALIDATION_FAILED':
          console.error('Response validation failed:', error.cause)
          break
        case 'UNDECLARED_STATUS':
          console.error('Undeclared status:', error.response?.status)
          break
      }
      break
    }
  }
}
```

## API 重新命名

部分 API 名稱已標準化，以提高清晰度：

| 舊 API | 新 API | 說明 |
|---------|---------|------|
| `withSseOptions` | `withSSEOptions` | SSE 設定輔助函式，命名統一為大寫縮寫 |
| `createGlobalClient` | `createClient` | 建立用戶端；不再使用全域單例 |
| `getGlobalClient` | — | 已移除；使用顯式用戶端實例 |
| `setGlobalClient` | — | 已移除；使用顯式用戶端實例 |
| `resetGlobalClient` | — | 已移除；使用顯式用戶端實例 |
| `cloneClient` | `createClient(...)` | 透過建立新實例來複製 |
| `provideGlobalClient` | `provideClient` | Angular/Vue 提供者，命名統一 |

## 更嚴格的端點定義規則

Defjs 強制執行一條嚴格規則：**當提供 `build` 時，必須同時提供 `input`。**

```typescript
// 正確：同時提供 input 與 build
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.object({
    path: struct.object({ id: struct.number() }),
  }),
  build(request, input) {
    request.setPathParams({ id: input.path.id })
  },
  output: { 200: struct.object({ id: struct.number(), name: struct.string() }) },
})

// 正確：不提供 input 也不提供 build
const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
  output: { 200: struct.object({ items: struct.array(struct.object({ id: struct.number() })) }) },
})

// 錯誤：提供 build 但缺少 input
const badRequest = defineRequest({
  method: 'GET',
  path: '/users/:id',
  build(request, input) {
    request.setPathParams({ id: input.id }) // TypeScript 錯誤：缺少 input 結構描述
  },
  output: { 200: struct.object({ id: struct.number() }) },
})
```

此規則同樣適用於 `defineEventStream` 與 `defineWebSocket`。

## 版本相容性

| 套件 | 相容版本 |
|---------|-------------------|
| `@defjs/core` | `^0.4.0` |
| `@defjs/angular` | `19.x` |
| `@defjs/vue` | `^0.4.0` |

Angular peer dependency 範圍：`>=18.0.0 <=22.0.0`。Node 執行環境：`>=26`。

## 接下來

- [用戶端 →](/core/client) — 顯式用戶端設計與設定
- [指令 →](/core/commands) — 指令定義與輸入規則
- [錯誤 →](/core/errors) — `RequestError` 結構與分支
"""

# For ja-JP migration.md:
ja_jp_migration = """---
title: Breaking Changes
description: 他の HTTP ライブラリの一般的なパターンとは異なる API 設計上の決定事項。
---

# Breaking Changes

Defjs は、他の HTTP ライブラリで見られる一般的なパターンとは意図的に異なる設計を採用しています。このドキュメントでは、それぞれの決定事項の設計根拠を説明します。

## グローバルクライアントなし

Defjs はグローバルシングルトンクライアントを提供しません。明示的に `Client` インスタンスを作成して渡す必要があります。

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
)

const [error, data] = await client.execute(getUser())
```

この設計の理由：

- **テストしやすい**：テスト間でグローバル状態をリセットやモック化する必要がありません。異なる `Client` インスタンスを直接渡せます。
- **マルチ環境の共存**：同一プロセス内で複数のクライアントを並行して実行できます（例：内部 API + 公開 API）。干渉はありません。
- **依存関係の透明性**：呼び出し側は明示的に `Client` を保持する必要があり、静的解析やコードレビューで依存関係が可視化されます。

「デフォルト」としての利便性が必要な場合は、アプリケーションレイヤーでラップしてください：

```typescript
// api/client.ts
import { createClient, withEndpoint } from '@defjs/core'

export const apiClient = createClient(
  withEndpoint(import.meta.env.VITE_API_ENDPOINT),
)
```

## フレームワークグローバルプロバイダーなし

`@defjs/angular` と `@defjs/vue` は、グローバルクライアントプロバイダーを提供しません。`provideClient` + `injectClient` を使って、フレームワークの依存性注入システム内でクライアントを登録・取得してください。

### Angular

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/angular'

export const appConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}

export class UserComponent {
  private client = injectClient()

  async loadUser() {
    const [error, user] = await this.client.execute(this.getUser())
  }
}
```

### Vue

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/vue'

app.use(provideClient(withEndpoint('https://api.example.com')))

const client = injectClient()
const [error, user] = await client.execute(getUser())
```

## リクエストレベルのオプションは `execute` に渡す、Builder ではない

リクエストレベルのオプション（`abort`、`timeout`、`heartbeat`、`reconnect` など）は、`client.execute` の第 2 引数で渡します。コマンドビルダーではありません。

```typescript
// 正しい：リクエストレベルのオプションは execute に渡す
const [error, user] = await client.execute(getUser(), { timeout: 5000 })
```

## コマンドタイプでオーバーロードされた `execute`

`client.execute` は `Command` タイプに基づいて、自動的に正しい結果型を返します。

```typescript
// HTTP リクエスト — HttpAwaitResult を返す
const [error, user, response] = await client.execute(httpCommand())

// SSE ストリーム — StreamAwaitResult を返す
const [error, stream, open] = await client.execute(sseCommand())

// WebSocket — SocketAwaitResult を返す
const [error, socket, connection] = await client.execute(wsCommand())
```

## `onInvalidEvent` はオブザーバー

SSE の `onInvalidEvent` はオブザーバーです。内部で例外が発生しても静かに無視され、ストリームは中断されません。

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
      // たとえここでスローしても、ストリームは継続します
    },
  },
})
```

## エラーサブモジュールの統合

すべてのエラーシンボルは、メインの `@defjs/core` エントリポイントからエクスポートされます。

| エクスポート | 説明 | 典型的な使い方 |
|--------|-------------|---------------|
| `RequestError` | エラー共用体型 | `switch (error.kind)` による分岐 |
| `ERR_ABORTED` | 中断識別子 | `controller.abort(ERR_ABORTED)` |
| `ERR_TIMEOUT` | タイムアウト識別子 | `createTransportError(ERR_TIMEOUT)` |
| `createTransportError` | トランスポートエラーを作成 | `createTransportError(new Error('offline'))` |
| `createDefinitionError` | 定義エラーを作成 | `createDefinitionError('REQUEST_VALIDATION_FAILED', cause)` |
| `createHttpStatusError` | HTTP ステータスエラーを作成 | `createHttpStatusError(404, 'Not Found', response, data)` |

メインエントリからインポート：

```typescript
import {
  RequestError,
  ERR_ABORTED,
  ERR_TIMEOUT,
  createTransportError,
  createDefinitionError,
  createHttpStatusError,
} from '@defjs/core'
```

## `kind` と `code` によるエラー分岐

Defjs は、文字列比較ではなく `kind` と `code` による分岐を推奨します。

```typescript
const [error, user] = await client.execute(getUser())

if (error) {
  switch (error.kind) {
    case 'http': {
      console.error('HTTP', error.status, error.message)
      if (error.status === 404) {
        console.error('Not found:', error.data.code)
      }
      break
    }
    case 'transport': {
      switch (error.code) {
        case 'ABORTED':
          console.error('Request aborted')
          break
        case 'TIMEOUT':
          console.error('Request timed out')
          break
        case 'NETWORK_ERROR':
          console.error('Network error:', error.cause)
          break
      }
      break
    }
    case 'definition': {
      switch (error.code) {
        case 'REQUEST_VALIDATION_FAILED':
          console.error('Request validation failed:', error.cause)
          break
        case 'RESPONSE_VALIDATION_FAILED':
          console.error('Response validation failed:', error.cause)
          break
        case 'UNDECLARED_STATUS':
          console.error('Undeclared status:', error.response?.status)
          break
      }
      break
    }
  }
}
```

## API 名称変更

一部の API 名は、明確性のために標準化されました：

| 旧 API | 新 API | 備考 |
|---------|---------|------|
| `withSseOptions` | `withSSEOptions` | SSE 設定ヘルパー。大文字略語に統一 |
| `createGlobalClient` | `createClient` | クライアントを作成。グローバルシングルトンなし |
| `getGlobalClient` | — | 削除。明示的なクライアントインスタンスを使用 |
| `setGlobalClient` | — | 削除。明示的なクライアントインスタンスを使用 |
| `resetGlobalClient` | — | 削除。明示的なクライアントインスタンスを使用 |
| `cloneClient` | `createClient(...)` | 新規インスタンスを作成してクローン |
| `provideGlobalClient` | `provideClient` | Angular/Vue プロバイダー。名称統一 |

## より厳密なエンドポイント定義ルール

Defjs は厳密なルールを適用します：**`build` を提供する場合は `input` も同時に提供する必要があります。**

```typescript
// 正しい：input と build の両方を持つ
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.object({
    path: struct.object({ id: struct.number() }),
  }),
  build(request, input) {
    request.setPathParams({ id: input.path.id })
  },
  output: { 200: struct.object({ id: struct.number(), name: struct.string() }) },
})

// 正しい：input と build の両方を持たない
const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
  output: { 200: struct.object({ items: struct.array(struct.object({ id: struct.number() })) }) },
})

// エラー：build はあるが input がない
const badRequest = defineRequest({
  method: 'GET',
  path: '/users/:id',
  build(request, input) {
    request.setPathParams({ id: input.id }) // TypeScript エラー：input スキーマが不足
  },
  output: { 200: struct.object({ id: struct.number() }) },
})
```

このルールは `defineEventStream` と `defineWebSocket` にも適用されます。

## バージョン互換性

| パッケージ | 互換性のあるバージョン |
|---------|-------------------|
| `@defjs/core` | `^0.4.0` |
| `@defjs/angular` | `19.x` |
| `@defjs/vue` | `^0.4.0` |

Angular peer dependency 範囲：`>=18.0.0 <=22.0.0`。Node ランタイム：`>=26`。

## 次に読む

- [Client →](/core/client) — 明示的なクライアント設計と設定
- [Commands →](/core/commands) — コマンド定義と入力ルール
- [Errors →](/core/errors) — `RequestError` の構造と分岐
"""

# For ko-KR migration.md:
ko_kr_migration = """---
title: Breaking Changes
description: 다른 HTTP 라이브러리의 일반적인 패턴과 의도적으로 다른 API 설계 결정 사항입니다.
---

# Breaking Changes

Defjs는 다른 HTTP 라이브러리에서 흔히 볼 수 있는 패턴과 의도적으로 다르게 설계된 부분이 있습니다. 이 문서는 각 결정의 설계 근거를 설명합니다.

## 전역 클라이언트 없음

Defjs는 전역 싱글턴 클라이언트를 제공하지 않습니다. 명시적으로 `Client` 인스턴스를 생성하여 전달해야 합니다.

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
)

const [error, data] = await client.execute(getUser())
```

이 설계의 이점:

- **테스트 친화적**: 테스트 간에 전역 상태를 리셋하거나 모킹할 필요가 없어요. 다른 `Client` 인스턴스를 직접 전달하면 돼요.
- **멀티 환경 공존**: 동일 프로세스에서 여러 클라이언트가 병렬로 실행돼도 간섭하지 않아요(예: 내부 API + 공개 API).
- **의존성 투명성**: 호출자가 반드시 `Client`를 명시적으로 보유해야 해서, 정적 분석과 코드 리뷰에서 의존성이 보여요.

"기본" 편의 기능이 필요하다면 애플리케이션 레이어에서 감싸세요:

```typescript
// api/client.ts
import { createClient, withEndpoint } from '@defjs/core'

export const apiClient = createClient(
  withEndpoint(import.meta.env.VITE_API_ENDPOINT),
)
```

## 프레임워크 전역 프로바이더 없음

`@defjs/angular`와 `@defjs/vue`는 전역 클라이언트 프로바이더를 제공하지 않아요. `provideClient` + `injectClient`를 사용하여 프레임워크의 의존성 주입 시스템 내에서 클라이언트를 등록하고 접근하세요.

### Angular

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/angular'

export const appConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}

export class UserComponent {
  private client = injectClient()

  async loadUser() {
    const [error, user] = await this.client.execute(this.getUser())
  }
}
```

### Vue

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/vue'

app.use(provideClient(withEndpoint('https://api.example.com')))

const client = injectClient()
const [error, user] = await client.execute(getUser())
```

## 요청 레벨 옵션은 `execute`에 전달, Builder 아님

요청 레벨 옵션(`abort`, `timeout`, `heartbeat`, `reconnect` 등)은 `client.execute`의 두 번째 인자로 전달돼요. 커맨드 빌더가 아니에요.

```typescript
// 올바름: 요청 레벨 옵션은 execute에 전달
const [error, user] = await client.execute(getUser(), { timeout: 5000 })
```

## 커맨드 타입으로 오버로드된 `execute`

`client.execute`는 `Command` 타입에 따라 자동으로 올바른 결과 타입을 반환해요.

```typescript
// HTTP 요청 — HttpAwaitResult 반환
const [error, user, response] = await client.execute(httpCommand())

// SSE 스트림 — StreamAwaitResult 반환
const [error, stream, open] = await client.execute(sseCommand())

// WebSocket — SocketAwaitResult 반환
const [error, socket, connection] = await client.execute(wsCommand())
```

## `onInvalidEvent`는 이제 옵저버

SSE의 `onInvalidEvent`는 이제 옵저버예요. 내부에서 예외를 던져도 조용히 무시되고 스트림이 중단되지 않아요.

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
      // 내부에서 예외를 던져도 스트림은 계속돼요
    },
  },
})
```

## 오류 서브모듈 통합

모든 오류 심볼은 메인 `@defjs/core` 엔트리에서 보내져요.

| Export | 설명 | 일반적인 사용법 |
|--------|-------------|---------------|
| `RequestError` | 오류 유니온 타입 | `switch (error.kind)` 분기 |
| `ERR_ABORTED` | 중단 식별자 | `controller.abort(ERR_ABORTED)` |
| `ERR_TIMEOUT` | 타임아웃 식별자 | `createTransportError(ERR_TIMEOUT)` |
| `createTransportError` | 트랜스포트 오류 생성 | `createTransportError(new Error('offline'))` |
| `createDefinitionError` | 정의 오류 생성 | `createDefinitionError('REQUEST_VALIDATION_FAILED', cause)` |
| `createHttpStatusError` | HTTP 상태 오류 생성 | `createHttpStatusError(404, 'Not Found', response, data)` |

메인 엔트리에서 임포트:

```typescript
import {
  RequestError,
  ERR_ABORTED,
  ERR_TIMEOUT,
  createTransportError,
  createDefinitionError,
  createHttpStatusError,
} from '@defjs/core'
```

## `kind`와 `code`로 오류 분기

Defjs는 문자열 비교 대신 `kind`와 `code`로 분기하는 것을 권장해요.

```typescript
const [error, user] = await client.execute(getUser())

if (error) {
  switch (error.kind) {
    case 'http': {
      console.error('HTTP', error.status, error.message)
      if (error.status === 404) {
        console.error('Not found:', error.data.code)
      }
      break
    }
    case 'transport': {
      switch (error.code) {
        case 'ABORTED':
          console.error('Request aborted')
          break
        case 'TIMEOUT':
          console.error('Request timed out')
          break
        case 'NETWORK_ERROR':
          console.error('Network error:', error.cause)
          break
      }
      break
    }
    case 'definition': {
      switch (error.code) {
        case 'REQUEST_VALIDATION_FAILED':
          console.error('Request validation failed:', error.cause)
          break
        case 'RESPONSE_VALIDATION_FAILED':
          console.error('Response validation failed:', error.cause)
          break
        case 'UNDECLARED_STATUS':
          console.error('Undeclared status:', error.response?.status)
          break
      }
      break
    }
  }
}
```

## API 이름 변경

일부 API 이름은 명확성을 위해 표준화되었습니다:

| 구버전 API | 신버전 API | 설명 |
|---------|---------|------|
| `withSseOptions` | `withSSEOptions` | SSE 설정 헬퍼, 대문자 약어로 이름 표준화 |
| `createGlobalClient` | `createClient` | 클라이언트 생성; 전역 싱글턴 없음 |
| `getGlobalClient` | — | 제거됨; 명시적 클라이언트 인스턴스를 사용하세요 |
| `setGlobalClient` | — | 제거됨; 명시적 클라이언트 인스턴스를 사용하세요 |
| `resetGlobalClient` | — | 제거됨; 명시적 클라이언트 인스턴스를 사용하세요 |
| `cloneClient` | `createClient(...)` | 새 인스턴스 생성으로 복제 |
| `provideGlobalClient` | `provideClient` | Angular/Vue 프로바이더, 통일된 이름 |

## 더 엄격한 엔드포인트 정의 규칙

Defjs는 엄격한 규칙을 강제해요: **`build`가 제공되면 `input`도 반드시 제공되어야 한다.**

```typescript
// 올바름: input과 build 모두 있음
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.object({
    path: struct.object({ id: struct.number() }),
  }),
  build(request, input) {
    request.setPathParams({ id: input.path.id })
  },
  output: { 200: struct.object({ id: struct.number(), name: struct.string() }) },
})

// 올바름: input과 build 모두 없음
const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
  output: { 200: struct.object({ items: struct.array(struct.object({ id: struct.number() })) }) },
})

// 오류: build는 있지만 input이 없음
const badRequest = defineRequest({
  method: 'GET',
  path: '/users/:id',
  build(request, input) {
    request.setPathParams({ id: input.id }) // TypeScript 오류: input 스키마 누락
  },
  output: { 200: struct.object({ id: struct.number() }) },
})
```

이 규칙은 `defineEventStream`과 `defineWebSocket`에도 적용돼요.

## 버전 호환성

| 패키지 | 호환 버전 |
|---------|-------------------|
| `@defjs/core` | `^0.4.0` |
| `@defjs/angular` | `19.x` |
| `@defjs/vue` | `^0.4.0` |

Angular 피어 의존성 범위: `>=18.0.0 <=22.0.0`. Node 런타임: `>=26`.

## 다음 단계

- [클라이언트 →](/core/client) — 명시적 클라이언트 설계와 설정
- [커맨드 →](/core/commands) — 커맨드 정의와 입력 규칙
- [오류 →](/core/errors) — `RequestError` 구조와 분기
"""

migrations = {
    "zh-Hans": zh_hans_migration,
    "zh-Hant": zh_hant_migration,
    "ja-JP": ja_jp_migration,
    "ko-KR": ko_kr_migration,
}

for lang, content in migrations.items():
    path = os.path.join(BASE, lang, "guide", "migration.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Wrote {path}")

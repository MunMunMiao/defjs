---
title: OpenTelemetry Server
description: Server-side outbound tracing without SDK initialization. Supports HTTP, SSE, and WebSocket with OpenTelemetry metrics and trace collection.
---

# @defjs/opentelemetry-server

サーバーサイドの OpenTelemetry 統合パッケージで、`@defjs/core` の HTTP、SSE、WebSocket クライアントに対してアウトバウンドトレースとメトリクスの収集を提供します。

**コアポジショニング**:

- **サーバー環境**（Node.js、Bun、Deno）向け。ブラウザ環境には依存しません。
- **SDK は初期化しない** — OpenTelemetry SDK は外部で初期化し、作成した `Tracer`（およびオプションで `Meter`）を渡す必要があります。
- **トランスポートごとの分離** — HTTP、SSE、WebSocket それぞれに独立したインターセプター、スパンライフサイクル、メトリクスディメンションを持ちます。

## リポジトリのワークスペース利用について

このページは現在、このリポジトリ内での source/workspace 利用を前提に説明しています。`@defjs/opentelemetry-server` は `packages/opentelemetry-server` にあり、その peer dependency は `packages/core` にある対応する `@defjs/core` のワークスペース版を前提にしています。

以下の import specifier はパッケージ名で書かれていますが、このリポジトリ内では公開 registry から一緒にインストールしたパッケージ対ではなく、ワークスペースのソースパッケージへ解決されます。アプリケーション側の OpenTelemetry SDK 依存関係は、引き続き別途インストールし、初期化してください。

公開 npm では現在 `@defjs/opentelemetry-server` は提供されておらず、そこで入手できる最新の単独 `@defjs/core` リリースも、このワークスペースパッケージと互換性のある peer ではありません。今後 `@defjs/opentelemetry-server` と互換性のある `@defjs/core` を、あなたが管理する registry や両方のバージョンを配布する別の registry に公開した場合は、その環境では公開済みの両パッケージを組み合わせてインストールし、このワークスペースパッケージと互換性のない単独 `@defjs/core` リリースを混在させないでください。

## 基本的な使い方

外部で作成した `Tracer` を渡し、`withOpenTelemetryServer` でクライアントを設定します：

```typescript
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { trace } from '@opentelemetry/api'

// 1. OpenTelemetry SDK を外部で初期化し、tracer を取得
const tracer = trace.getTracer('my-service')

// 2. tracer をクライアント設定に注入
const client = createClient(withEndpoint('https://api.example.com'), withOpenTelemetryServer({ tracer }))
```

## 完全な設定

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withOpenTelemetryServer({
    tracer, // 必須
    meter, // オプション。提供された場合のみメトリクスを収集
    propagator, // オプション。デフォルトは W3C TraceContext + Baggage
    requireParentSpan: false,
    http: {
      enabled: true,
      requestHook(span, req) {
        span.setAttribute('defjs.operation', req.endpoint)
      },
      responseHook(span, res) {
        span.setAttribute('defjs.response.status_text', res.statusText)
      },
    },
    sse: {
      enabled: true,
    },
    webSocket: {
      enabled: true,
      queryPropagation: false,
    },
  }),
)
```

### 設定オプション

| オプション          | 型                                    | デフォルト                 | 説明                                                         |
| ------------------- | ------------------------------------- | -------------------------- | ------------------------------------------------------------ |
| `tracer`            | `Tracer`                              | **必須**                   | 外部 OpenTelemetry tracer                                    |
| `meter`             | `Meter`                               | `undefined`                | 外部 OpenTelemetry meter。省略するとメトリクスは無効化       |
| `propagator`        | `TextMapPropagator`                   | W3C TraceContext + Baggage | カスタムコンテキスト伝播器                                   |
| `requireParentSpan` | `boolean`                             | `false`                    | アクティブな親スパンがある場合のみアウトバウンドスパンを作成 |
| `http`              | `OpenTelemetryServerHttpOptions`      | `{}`                       | HTTP トランスポートのトレース／メトリクスオプション          |
| `sse`               | `OpenTelemetryServerSSEOptions`       | `{}`                       | SSE トランスポートのトレース／メトリクスオプション           |
| `webSocket`         | `OpenTelemetryServerWebSocketOptions` | `{}`                       | WebSocket トランスポートのトレース／メトリクスオプション     |

### HTTP オプション

| オプション     | 型                    | デフォルト  | 説明                                                                      |
| -------------- | --------------------- | ----------- | ------------------------------------------------------------------------- |
| `enabled`      | `boolean`             | `true`      | HTTP トレースを有効化                                                     |
| `requestHook`  | `(span, req) => void` | `undefined` | HTTP リクエスト前にスパンをカスタマイズ。`req` は `HttpRequest`           |
| `responseHook` | `(span, res) => void` | `undefined` | HTTP レスポンス後にスパンをカスタマイズ。`res` は `HttpResponse<unknown>` |

### SSE オプション

| オプション     | 型                       | デフォルト  | 説明                                                                                          |
| -------------- | ------------------------ | ----------- | --------------------------------------------------------------------------------------------- |
| `enabled`      | `boolean`                | `true`      | SSE トレースを有効化                                                                          |
| `requestHook`  | `(span, req) => void`    | `undefined` | ストリームリクエスト前に SSE スパンをカスタマイズ                                             |
| `responseHook` | `(span, stream) => void` | `undefined` | ストリームハンドル返却後に SSE スパンをカスタマイズ。`stream` は `EventStreamHandle<unknown>` |

### WebSocket オプション

| オプション         | 型                        | デフォルト  | 説明                                                                                   |
| ------------------ | ------------------------- | ----------- | -------------------------------------------------------------------------------------- |
| `enabled`          | `boolean`                 | `true`      | WebSocket トレースを有効化                                                             |
| `queryPropagation` | `boolean`                 | `true`      | ブラウザ互換性のために WebSocket URL のクエリ文字列へトレースコンテキストを注入します。セキュリティ重視の本番トラフィックでは、`false` を推奨ベースラインとして明示してください。 |
| `requestHook`      | `(span, req) => void`     | `undefined` | 接続リクエスト前に WebSocket スパンをカスタマイズ                                      |
| `responseHook`     | `(span, session) => void` | `undefined` | セッション返却後に WebSocket スパンをカスタマイズ。`session` は `WebSocketSessionLike` |

> **フック例外処理**: `requestHook` または `responseHook` がスローしても、エラーはスパンの `defjs.otel.hook.error` イベントとして記録されますが、クライアントのリクエスト／ストリーム／セッションは**正常に継続します**。
>
> **属性衛生**: `requestHook` / `responseHook` では、明示的な allowlist、redaction、安定した低カーディナリティ属性を優先してください。アプリケーション側でプライバシー、カーディナリティ、保持、redaction 要件を確認済みでない限り、生のクエリ文字列、リクエスト／レスポンスボディ、完全なヘッダー、baggage 値、メッセージペイロードを付加しないでください。

## 旧 API からの移行

| 旧設定                    | 新設定                                                           |
| ------------------------- | ---------------------------------------------------------------- |
| `http: false`             | `http: { enabled: false }`                                       |
| `sse: false`              | `sse: { enabled: false }`                                        |
| `webSocket: false`        | `webSocket: { enabled: false }`                                  |
| `requestHook`             | `http.requestHook` / `sse.requestHook` / `webSocket.requestHook` |
| `responseHook`            | `http.responseHook` / `sse.responseHook` / `webSocket.responseHook` |
| `webSocketQueryPropagation` | `webSocket.queryPropagation`                                   |

各トランスポートが正しいリクエスト／レスポンス型を公開できるように、旧トップレベルフックと真偽値のトランスポート切り替えは意図的に削除されています。削除されたこれらの旧 JavaScript オプションを渡すと、現在は有効化済み計測として黙って解釈されるのではなく、移行エラーがスローされます。

## HTTP セマンティック規約とメトリクス

HTTP トレースは、安定した OpenTelemetry HTTP クライアントセマンティック規約に従います。デフォルトでは、以下の主要属性を持つ `SpanKind.CLIENT` スパンを記録します：

- `http.request.method`
- `url.full`
- `server.address`
- `server.port`
- `http.response.status_code`

`meter` が提供された場合、以下の安定したメトリクスが収集されます：

| メトリクス                     | 単位 | 属性                                                                                                                                                  |
| ------------------------------ | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `http.client.request.duration` | `s`  | `http.request.method`、オプションで `http.response.status_code`、オプションで `server.address`、オプションで `server.port`、オプションで `error.type` |

デフォルトでは、**リクエスト／レスポンスボディ、完全なヘッダー、baggage 値、ペイロードサイズ、メッセージペイロードはカスタムテレメトリ項目として追加されません**。また、このパッケージは**生のクエリ文字列専用の個別スパン属性やメトリクスも作成しません**。ただし `url.full` はアプリケーションが実際に構築したリクエスト URL を反映するため、その URL 自体にクエリ文字列が含まれていれば、そこに現れる可能性があります。可能であれば、URL にトークン、ユーザー ID、その他の機密性または高カーディナリティな入力を含めないでください。

アプリケーション側でプライバシー、カーディナリティ、保持、redaction 要件を確認済みでない限り、生のクエリ文字列、リクエスト／レスポンスボディ、完全なヘッダー、baggage 値、メッセージペイロードをスパンやメトリクスに追加しないでください。フックでテレメトリを拡張する場合は、明示的な allowlist、redaction、安定した低カーディナリティ属性を優先してください。

## SSE 接続レベルトレースとカスタムメトリクス

SSE は長寿命の HTTP レスポンスです。通常の HTTP リクエスト所要時間はストリーム確立時に終了しますが、これはストリームがまだ実行中であるか、中断されたか、エラーになったかを反映しません。そのため、このパッケージは SSE を**接続レベル**テレメトリとして扱います。

### スパンライフサイクル

SSE スパンは `stream.closed` が解決するまで開いたままになり、以下のライフサイクルイベントを記録します：

- `sse.connected` — ストリームが正常に確立された
- `sse.closed` — ストリームが正常に終了（サーバー EOF）
- `sse.aborted` — `stream.close()` による能動的クローズ
- `sse.error` — 接続エラーまたは再接続枯渇

### カスタムメトリクス

`meter` が提供された場合、以下の defjs カスタムメトリクスが収集されます（非公式の OpenTelemetry 安定セマンティック規約）：

| メトリクス                             | 単位       | 意味                                               |
| -------------------------------------- | ---------- | -------------------------------------------------- |
| `defjs.client.sse.connect.duration`    | `s`        | ストリーム接続確立までの時間                       |
| `defjs.client.sse.connection.duration` | `s`        | ストリーム確立からクローズ／エラーまでの総所要時間 |
| `defjs.client.sse.active_streams`      | `{stream}` | 現在のアクティブ SSE ストリーム数                  |

デフォルトでは、**イベントごとのスパンは作成されず**、**イベントペイロード、イベント ID、`Last-Event-ID`、配信レイテンシー、失われたイベント、再接続キューは収集されません**。これらはアプリケーションレベルのセマンティクスであり、高カーディナリティまたは機密性を持つテレメトリを生成する可能性があります。必要に応じてアプリケーションレイヤーで実装してください。

## WebSocket 接続レベルトレースとカスタムメトリクス

WebSocket は HTTP Upgrade ハンドシェイクで開始されますが、本番環境ではハンドシェイク後の接続ライフサイクルの方が重要です：アクティブ接続、接続所要時間、クローズ／エラー動作、接続失敗率。OpenTelemetry の WebSocket セマンティック規約はまだ安定していないため、このパッケージは接続レベルのカスタムメトリクスを使用します。

### スパンライフサイクル

WebSocket スパンは `session.closed` が解決するまで開いたままになり、以下のライフサイクルイベントを記録します：

- `websocket.connected` — セッションが正常に確立された
- `websocket.closed` — 接続が正常にクローズされた
- `websocket.error` — 接続エラー

### カスタムメトリクス

`meter` が提供された場合、以下の defjs カスタムメトリクスが収集されます：

| メトリクス                                   | 単位           | 意味                                               |
| -------------------------------------------- | -------------- | -------------------------------------------------- |
| `defjs.client.websocket.connect.duration`    | `s`            | WebSocket セッション確立までの時間                 |
| `defjs.client.websocket.connection.duration` | `s`            | セッション確立からクローズ／エラーまでの総所要時間 |
| `defjs.client.websocket.active_connections`  | `{connection}` | 現在のアクティブ WebSocket 接続数                  |

デフォルトでは、**メッセージごとのスパンは作成されず**、**メッセージペイロード、メッセージサイズ、バックプレッシャー、buffered amount、サブプロトコル、再接続キューは収集されません**。メッセージレベルのテレメトリは、サンプリング戦略を持つアプリケーションレイヤーで実装すべきです。

## WebSocket クエリ伝播のセキュリティリスク

ブラウザの WebSocket クライアントは通常、任意の HTTP ヘッダーを設定できないため、`webSocket.queryPropagation` の実行時デフォルトは互換性のため `true` です。このデフォルトにより、トレースコンテキストが WebSocket URL のクエリ文字列へ注入されます。

クエリ文字列は、プロキシ、ブラウザ、APM ツール、アクセスログ、ネットワークデバッグツールによって記録される可能性があります。また、トークン、ユーザー ID、その他の高カーディナリティ入力を含む場合もあります。伝播器が `baggage` を含む場合、baggage 値も URL に書き込まれ、機密データを含む可能性があります。

セキュリティ重視の本番 WebSocket 通信では、推奨される安全ベースラインとしてクエリ伝播を明示的に無効化してください：

```typescript
withOpenTelemetryServer({
  tracer,
  webSocket: { queryPropagation: false },
})
```

無効化すると、トレースコンテキストは WebSocket URL では運ばれなくなります。サーバー側で引き続き接続を trace に関連付ける必要がある場合は、アプリケーション層で別のレビュー済み相関手段を使ってください。

## 次に読む

- [Client](/core/client) — `createClient` と完全なトランスポート設定
- [SSE](/core/sse) — `defineEventStream` とストリーミングイベントの消費
- [WebSocket](/core/web-socket) — `defineWebSocket` とリアルタイム通信

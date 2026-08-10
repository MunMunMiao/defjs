---
title: OpenTelemetry Server
description: アプリケーションが渡す OpenTelemetry Tracer と任意の Meter で、Defjs のアウトバウンド HTTP、SSE、WebSocket クライアントを計装します。
---

# `@defjs/opentelemetry-server`

パッケージ名に server とありますが、このアダプターが計装するのは Defjs クライアントのアウトバウンド処理です。インバウンドのサーバー計装ではなく、OpenTelemetry SDK の初期化も行いません。

アプリケーションは次を所有します。

- SDK とプロバイダーの初期化
- exporter と processor の設定
- コンテキストマネージャーとアクティブコンテキストの設定
- サンプリング、属性ポリシー、マスキング
- force-flush と shutdown

アプリケーションが用意した `Tracer` と任意の `Meter` を `withOpenTelemetryServer(...)` へ渡します。

## クライアントを設定する

```typescript
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { metrics, trace } from '@opentelemetry/api'

// Initialize and register the application's SDK/providers before this point.
const tracer = trace.getTracer('orders-service')
const meter = metrics.getMeter('orders-service')

const client = createClient(
  withEndpoint('https://api.example.com'),
  withOpenTelemetryServer({
    tracer,
    meter,
    webSocket: {
      queryPropagation: false,
    },
  }),
)
```

アダプターは、有効なトランスポートごとにインターセプターを 1 つ追加します。オプションは通常のクライアント順序で実行されるため、ほかのインターセプターに対する配置によってスパンが包む処理範囲が変わります。

## オプション

```typescript
interface OpenTelemetryServerOptions {
  tracer: Tracer
  meter?: Meter
  propagator?: TextMapPropagator
  requireParentSpan?: boolean
  http?: OpenTelemetryServerHttpOptions
  sse?: OpenTelemetryServerSSEOptions
  webSocket?: OpenTelemetryServerWebSocketOptions
}
```

各トランスポートオプションは `enabled?: boolean`、`requestHook`、`responseHook` を受け取ります。WebSocket は `queryPropagation?: boolean` も受け取ります。

3 つのトランスポートはすべてデフォルトで有効です。オプションオブジェクトで個別に無効化します。

```typescript
withOpenTelemetryServer({
  tracer,
  http: { enabled: false },
  sse: { enabled: true },
  webSocket: { enabled: false },
})
```

以前の boolean トランスポートフィールド、最上位フック、`webSocketQueryPropagation` は、ランタイムで移行エラーになります。現在の形式は、トランスポートオプションオブジェクト、トランスポート単位のフック、`webSocket.queryPropagation` です。

## 伝播

`propagator` を省略すると、パッケージは W3C Trace Context と W3C Baggage を含む独自の `CompositePropagator` を作ります。グローバルな propagator 設定は読みません。

HTTP と SSE は、その propagator が生成したすべてのフィールドをリクエストヘッダーへ注入します。`req.headers` がすでに `Headers` インスタンスなら、現在の実装はその同じインスタンスを再利用して直接変更します。それ以外の場合は、新しい `Headers` オブジェクトを作ります。WebSocket のクエリ伝播はデフォルトで `false` です。`queryPropagation: true` の場合だけ有効になり、ブラウザーソケットは任意のハンドシェイクヘッダーを追加できないため、propagator が生成したすべてのフィールドを接続クエリ文字列へ追加します。

各インターセプターはスパンを作る前に、リクエストヘッダーに対して `propagator.extract(...)` も呼び出します。この carrier は、アプリケーションが管理する信頼済み入力として扱ってください。信頼できない呼び出し元に `traceparent`、`tracestate`、`baggage` を渡させないでください。これらのフィールドによって、アクティブな親コンテキストが置き換わる可能性があります。信頼できない伝播フィールドは、このインターセプターへ届く前に削除または正規化してください。

```typescript
withOpenTelemetryServer({
  tracer,
  webSocket: {
    queryPropagation: true,
  },
})
```

有効にする前に、デプロイ先での URL 伝播をレビューしてください。トレースコンテキストと baggage は、ブラウザー、プロキシ、アクセスログ、テレメトリーシステムに記録される可能性があります。カスタム propagator は `traceparent` 以外のフィールドも追加できます。サーバーが対応している場合は、プロトコルとしてレビュー済みの最初のメッセージ、または有効期間が短い単回使用の接続チケットを推奨します。

`requireParentSpan: true` は、インターセプターが計装を始める前にアクティブな親スパンの有無を確認します。アクティブスパンがなければスパン作成、伝播、フック、メトリクスをすべて省略し、次のハンドラーを変更せず呼び出します。

## フックの動作

フックはトランスポート固有のスパンとリクエストまたは結果を受け取ります。

```typescript
withOpenTelemetryServer({
  tracer,
  http: {
    requestHook(span, request) {
      span.setAttribute('app.operation', 'list-orders')
    },
    responseHook(span, response) {
      span.setAttribute('app.result_class', response.status < 500 ? 'accepted' : 'server-error')
    },
  },
})
```

フックは `void` または `Promise<void>` を返せますが、クライアント操作を待たせません。同期 throw と非同期 rejection は捕捉され、操作を停止せず `defjs.otel.hook.error` として記録されます。この telemetry 記録自体の失敗も隔離されます。

許可リストに含めた、カーディナリティの低い属性を使ってください。生のヘッダー、クエリ文字列、ボディ、baggage、イベント ID、メッセージペイロード、認証情報は付けないでください。

## HTTP セマンティクス

HTTP インターセプターは `SpanKind.CLIENT` スパンを作り、次を記録します。

- `http.request.method`
- `url.full`
- `server.address` と任意の `server.port`
- レスポンス後の `http.response.status_code`

HTTP セマンティック規約への完全な準拠を示すものではありません。

現在のステータス動作は、多くのアプリケーションが期待するものより限定的です。

- ステータス `500` 以上はスパンを `ERROR` にします。
- ステータス `400` から `499` は `OK` にします。
- Defjs のステータス 0 トランスポートレスポンスは `OK` にします。
- インターセプターを通ってエラーが送出されると `ERROR` にし、例外を記録します。

HTTP スパンは、HTTP インターセプターが Defjs `HttpResponse` を受け取った時点で終了します。高レベル出力のステータスディスパッチと Struct デコードは、インターセプターから戻った後に行われます。そのため、後から発生した `RESPONSE_VALIDATION_FAILED` や `UNDECLARED_STATUS` は終了済みスパンを更新できません。

Meter がある場合、HTTP は `http.client.request.duration` を秒単位で記録します。属性にはメソッド、サーバーアドレスとポート、任意のレスポンスステータス、送出されたエラーの任意の `error.type` が含まれます。

## SSE セマンティクス

SSE の起動に成功すると、`stream.closed` が確定するまでスパンを開いたままにします。`sse.connected` を記録し、対象となるクローズ経路で `sse.closed`、`sse.aborted`、`sse.error` のいずれかを記録します。

Meter を指定した SSE 計装は次のメトリクスを使います。

| メトリクス                             | 意味                                        |
| -------------------------------------- | ------------------------------------------- |
| `defjs.client.sse.connect.duration`    | 論理ストリームハンドルが返るまでの時間。    |
| `defjs.client.sse.connection.duration` | ハンドルの返却から終端クローズまでの時間。  |
| `defjs.client.sse.active_streams`      | `closed` Promise が未確定の論理ハンドル数。 |

これらは Defjs 独自のメトリクスです。アクティブカウンターは物理的な再接続試行の間も数え続けます。現在オープンしている HTTP 接続の数ではありません。

## WebSocket セマンティクス

起動に成功すると、`session.closed` が確定するまで WebSocket スパンを開いたままにします。`websocket.connected` を記録し、対象となる経路で `websocket.closed` または `websocket.error` を記録します。

Meter を指定した WebSocket 計装は次のメトリクスを使います。

| メトリクス                                   | 意味                                          |
| -------------------------------------------- | --------------------------------------------- |
| `defjs.client.websocket.connect.duration`    | 論理セッションが返るまでの時間。              |
| `defjs.client.websocket.connection.duration` | セッションの返却から終端クローズまでの時間。  |
| `defjs.client.websocket.active_connections`  | `closed` Promise が未確定の論理セッション数。 |

メトリクス名は接続ですが、実装が数えるのは再接続遅延の間も含む論理セッションです。物理ソケット数ではありません。

汎用 WebSocket セマンティック規約は、ここでは安定していません。パッケージはメッセージごとのスパンを作らず、ペイロードとキュー長もデフォルトでは記録しません。

## 機密データとテスト範囲の限界

デフォルトの `url.full` はシリアライズ済みクエリ文字列ではなく、リクエストエンドポイントとベースエンドポイントから解決されます。それでも、解決後のパスに機密性のある識別子が含まれる場合はあります。WebSocket 伝播は別に実際のクエリ文字列へフィールドを追加します。

`recordException(...)` には、送出されたエラーと一部のクローズ原因が渡ります。エラーメッセージとスタックは機密データを含むことがあります。SDK レベルの processor と exporter で適切にマスキングしてください。このアダプターはアプリケーションに代わって例外を無害化しません。

デプロイ前に、サービスが使う SDK、exporter、processor、context manager、自動計装と組み合わせて検証してください。実トラフィックで、end-to-end baggage、マスキング、shutdown/flush、スパンの重複を確認します。

## 次に読む

- [Interceptors](/ja-JP/core/interceptors) — ほかのクライアントインターセプターとの順序
- [SSE](/ja-JP/core/sse) と [WebSocket](/ja-JP/core/web-socket) — ここで計測する論理ハンドルとセッションの存続期間

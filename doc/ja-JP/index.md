---
layout: home

hero:
  name: Defjs
  text: Typed APIs Across Transports
  tagline: 一度定義すれば、どこでも型安全。HTTP、SSE、WebSocket に対応し、実行時検証と完全な TypeScript 型推論を提供します。
  actions:
    - theme: brand
      text: はじめる
      link: /guide/getting-started
    - theme: alt
      text: GitHub で見る
      link: https://github.com/defjs/defjs

features:
  - icon: 🔒
    title: 型安全性
    details: struct でリクエストスキーマを定義し、入力・出力・エラーファンチのエンドツーエンド型推論を実現します。実行時検証が、本番環境に到達する前に不整合を検知します。
  - icon: 🌐
    title: マルチトランスポート
    details: HTTP リクエスト、Server-Sent Events、WebSocket 接続を、統一された API スタイルで実装できます。トランスポートを切り替えても、アプリケーションロジックを書き直す必要はありません。
  - icon: 🧅
    title: インターセプター
    details: トランスポートごとのオニオンモデルインターセプターで、ログ出力、認証、リトライ、横断的関心事を処理できます。HTTP、SSE、WebSocket それぞれに独自のインターセプター連鎖があります。
  - icon: 📡
    title: ストリーミング
    details: ネイティブな SSE と WebSocket 対応。自動再接続、ハートビート、メッセージキューイング、バックプレッシャー制御を内蔵しています。リアルタイムアプリケーションに最適です。
  - icon: ⚡
    title: ユニバーサルランタイム
    details: ブラウザ、Node.js、Bun、Deno で動作します。ポリフィルは不要です。コアパッケージは純粋な ESM で、実行時依存ゼロです。
  - icon: 🧩
    title: フレームワーク対応
    details: Vue、React 向けのファーストクラス統合。provideClient / injectClient / useClient パターンを提供します。サーバーサイドの可観測性には OpenTelemetry プラグインを利用できます。
---

## クイックスタート

お好みのパッケージマネージャーで `@defjs/core` をインストールします：

::: code-group

```bash [npm]
npm install @defjs/core
```

```bash [yarn]
yarn add @defjs/core
```

```bash [pnpm]
pnpm add @defjs/core
```

```bash [bun]
bun add @defjs/core
```

:::

型付きリクエストを定義し、3 行で実行します：

```typescript
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
  },
})

const [error, user] = await client.execute(getUser())
if (!error) {
  console.log(user.id, user.name) // 完全に型付き
}
```

## フレームワーク統合

<div class="framework-grid">

### Vue

`@defjs/vue` は Vue プラグインとして `provideClient` を、Composition API 向けに `injectClient` を提供します。型付き `@defjs/core` クライアントをアプリケーション全体で共有できます。

[詳細を見る →](/plugins/vue)

### React

`@defjs/react` は `ClientProvider`、`useClient`、option helpers を提供し、型付き `@defjs/core` client を React コンポーネントツリー全体で共有できます。

[詳細を見る →](/plugins/react)

</div>

## 次に読む

- [Getting Started →](/guide/getting-started) — インストール、CDN 利用、最初のリクエスト
- [Core Concepts →](/core/client) — クライアント、コマンド、コンテキスト、エラー処理
- [Examples →](/guide/examples) — REST CRUD、SSE 通知、WebSocket チャット、インターセプターパターン

<style>
.framework-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-top: 1.5rem;
}
.framework-grid > div,
.framework-grid > h3 {
  margin: 0;
}
.framework-grid h3 {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}
.framework-grid p {
  margin: 0 0 0.5rem;
  color: var(--vp-c-text-2);
}
.framework-grid a {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--vp-c-brand-1);
}
</style>

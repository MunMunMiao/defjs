---
title: 使用例
description: REST、SSE、WebSocket、認証、Vue、React のアプリケーションへ組み込める実用例です。
---

# 使用例

この例を自分のアプリケーションの出発点として使ってください。エンドポイントパス、Struct、認証情報、状態更新、テレメトリー名は、実際のサービス契約とポリシーに置き換えます。

各例は、モジュールまたはファイルの一部として必要なコードを揃えています。ネットワーク例では、示した契約をサーバーが実装している必要があります。エンドポイント値、認証情報、UI 状態、ログ、キャンセル、トランスポートのクリーンアップはアプリケーションで管理します。

## REST CRUD モジュール

このモジュールは Core への依存を明示し、すべてのボディにボディ Struct を使い、タプルで返る失敗を処理し、所有者が渡すキャンセル用の signal を受け取ります。

```typescript
// users-api.ts
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  email: struct.string(),
})

const ApiError = struct.object({
  code: struct.string(),
  message: struct.string(),
})

const client = createClient(withEndpoint('https://api.example.com/v1'))

const createUserRequest = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.request({
    body: struct.json(
      struct.object({
        name: struct.string(),
        email: struct.string(),
      }),
    ),
  }),
  output: [
    { status: 201, body: User },
    { status: [400, 409], body: ApiError },
  ] as const,
})

export const listUsersRequest = defineRequest({
  method: 'GET',
  path: '/users',
  input: struct.request({
    query: struct.object({
      cursor: struct.string().optional(),
    }),
  }),
  output: [
    {
      status: 200,
      body: struct.object({
        items: struct.array(User),
        nextCursor: struct.string().optional().alias('next_cursor'),
      }),
    },
  ] as const,
})

export const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: User },
    { status: 404, body: ApiError },
  ] as const,
})

const updateUserRequest = defineRequest({
  method: 'PUT',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
    body: struct.json(
      struct.object({
        name: struct.string(),
        email: struct.string(),
      }),
    ),
  }),
  output: [
    { status: 200, body: User },
    { status: 404, body: ApiError },
  ] as const,
})

const deleteUserRequest = defineRequest({
  method: 'DELETE',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 204, body: struct.unknown() },
    { status: 404, body: ApiError },
  ] as const,
})

export async function createUser(input: { name: string; email: string }, signal: AbortSignal) {
  const [error, user] = await client.execute(createUserRequest({ body: input }), { signal })

  if (error) {
    throw error
  }
  return user
}

export async function listUsers(cursor: string | undefined, signal: AbortSignal) {
  const [error, page] = await client.execute(listUsersRequest({ query: { cursor } }), { signal })

  if (error) {
    throw error
  }
  return page
}

export async function updateUser(id: number, input: { name: string; email: string }, signal: AbortSignal) {
  const [error, user] = await client.execute(updateUserRequest({ path: { id }, body: input }), { signal })

  if (error) {
    throw error
  }
  return user
}

export async function deleteUser(id: number, signal: AbortSignal): Promise<void> {
  const [error] = await client.execute(deleteUserRequest({ path: { id } }), { signal })

  if (error) {
    throw error
  }
}
```

エクスポート関数からエラーを例外として送出するのは、アプリケーション統合としての選択です。Core の実行自体は引き続きタプルを返します。

## SSE 通知コンシューマー

この関数は再試行とバッファに上限を設け、Struct でデコードされたイベントのユニオンをイベント名で絞り込み、自分で開いたストリームをクローズします。

```typescript
// consume-notifications.ts
import {
  createClient,
  defineEventStream,
  struct,
  type Infer,
  withEndpoint,
  withSSEOnInvalidEvent,
  withSSEQueue,
  withSSEReconnect,
} from '@defjs/core'

const notificationStruct = struct.object({
  id: struct.number(),
  text: struct.string(),
})
type Notification = Infer<typeof notificationStruct>

interface NotificationHandlers {
  onInvalid(event: { eventName: string; reason: string }): void
  onMessage(notification: Notification): void
}

const notifications = defineEventStream({
  path: '/notifications',
  events: {
    message: struct.json(notificationStruct),
  },
})

export async function consumeNotifications(signal: AbortSignal, handlers: NotificationHandlers): Promise<void> {
  const client = createClient(
    withEndpoint('https://api.example.com'),
    withSSEReconnect({ attempts: 5, delayMs: 1_000, maxDelayMs: 10_000 }),
    withSSEQueue({ maxSize: 100, overflow: 'drop-oldest' }),
    withSSEOnInvalidEvent(({ reason, message }) => {
      handlers.onInvalid({ eventName: message.event, reason })
    }),
  )

  const [error, stream] = await client.execute(notifications(), { signal })
  if (error) {
    throw error
  }

  try {
    for await (const event of stream) {
      switch (event.event) {
        case 'message':
          handlers.onMessage(event.data)
          break
      }
    }
  } finally {
    stream.close('consumer-finished')
    await stream.closed
  }
}
```

ハンドラーは短時間で終わり、例外を送出しない処理にしてください。この例は生のイベントデータ、ID、URL を記録しません。

## WebSocket ルームコンシューマー

再接続を明示的に設定しています。この関数は論理セッションの存続中、上限のない受信キューを消費し続け、送信キューには上限を設け、すべての終了経路でクローズします。

```typescript
// consume-room.ts
import {
  createClient,
  defineWebSocket,
  struct,
  withEndpoint,
  withWebSocketHeartbeat,
  withWebSocketQueue,
  withWebSocketReconnect,
} from '@defjs/core'

interface RoomHandlers {
  onMessage(message: { text: string; userId: number }): void
  onRuntimeError(): void
}

const room = defineWebSocket({
  path: '/rooms/:roomId',
  input: struct.request({
    path: struct.object({ roomId: struct.string() }),
  }),
  incoming: {
    message: struct.object({ text: struct.string(), userId: struct.number() }),
    pong: struct.object({}),
  },
  outgoing: {
    join: struct.object({}),
    ping: struct.object({}),
  },
})

export async function consumeRoom(roomId: string, signal: AbortSignal, handlers: RoomHandlers): Promise<void> {
  const client = createClient(
    withEndpoint('wss://chat.example.com'),
    withWebSocketReconnect({
      attempts: 5,
      shouldReconnect: ({ wasClean }) => !wasClean,
    }),
    withWebSocketHeartbeat({
      intervalMs: 30_000,
      timeoutMs: 10_000,
      message: () => ({ type: 'ping' }),
      isAck: (message) => typeof message === 'object' && message !== null && 'type' in message && message.type === 'pong',
    }),
    withWebSocketQueue({ maxSize: 20, overflow: 'drop-oldest' }),
  )

  const encodedRoomId = encodeURIComponent(roomId)
  const [error, session] = await client.execute(room({ path: { roomId: encodedRoomId } }), { signal })

  if (error) {
    throw error
  }

  const unsubscribeError = session.onRuntimeError(() => {
    handlers.onRuntimeError()
  })

  try {
    session.send({ type: 'join' })

    for await (const message of session.receive) {
      if (message.type === 'message') {
        handlers.onMessage({ text: message.text, userId: message.userId })
      }
    }
  } finally {
    unsubscribeError()
    session.close(1000, 'consumer-finished')
    await session.closed
  }
}
```

エンドポイントパスはプレースホルダーをエンコードしないため、この例ではコマンド作成前に 1 セグメントをエンコードしています。結果の URL やペイロードはログへ出しません。

## 認証と操作メトリクス

このファクトリーは HTTP/SSE 認証と、記録項目を限定した HTTP の所要時間計測を組み合わせます。操作名は URL ではなく、明示的な `HttpContext` トークンから取得します。

```typescript
// observed-client.ts
import {
  createClient,
  createHttpInterceptor,
  createSSEInterceptor,
  makeHttpContext,
  makeHttpContextToken,
  withEndpoint,
  withInterceptors,
} from '@defjs/core'
import type { HttpRequest } from '@defjs/core'

export type Operation = 'create-user' | 'delete-user' | 'list-users' | 'update-user'

interface MetricRecorder {
  record(value: { durationMs: number; operation: Operation | 'unknown'; status: number }): void
}

const operationToken = makeHttpContextToken<Operation | 'unknown'>(() => 'unknown')

function addBearerToken(request: HttpRequest, token: string) {
  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return { ...request, headers }
}

export function contextFor(operation: Operation) {
  return makeHttpContext().set(operationToken, operation)
}

export function createObservedClient(getToken: () => string | null, metrics: MetricRecorder) {
  const httpAuth = createHttpInterceptor((request, next) => {
    const token = getToken()
    return next(token ? addBearerToken(request, token) : request)
  })

  const sseAuth = createSSEInterceptor((request, next) => {
    const token = getToken()
    return next(token ? addBearerToken(request, token) : request)
  })

  const timing = createHttpInterceptor(async (request, next) => {
    const startedAt = performance.now()
    const response = await next(request)

    metrics.record({
      durationMs: Math.round(performance.now() - startedAt),
      operation: request.context?.get(operationToken) ?? 'unknown',
      status: response.status,
    })

    return response
  })

  return createClient(withEndpoint('https://api.example.com'), withInterceptors(timing, httpAuth, sseAuth))
}
```

実行時にコンテキストを渡します。

```typescript
import { getAccessToken } from './auth'
import { listUsersRequest } from './users-api'
import { contextFor, createObservedClient } from './observed-client'
import { outboundMetrics } from './telemetry'

const client = createObservedClient(getAccessToken, outboundMetrics)
const [error, users] = await client.execute(listUsersRequest(), {
  context: contextFor('list-users'),
})

if (error) {
  throw error
}
```

認証情報プロバイダーはアプリケーションが所有します。サーバーではリクエストスコープに保ってください。ネイティブブラウザーソケットはこのヘッダーを追加できないため、ブラウザーの WebSocket 認証にはデプロイ先に合わせてレビューした別設計が必要です。

## Vue で組み合わせる

アプリケーションにはブラウザークライアントを 1 つインストールします。コンポーネントは prop を監視し、古くなった HTTP 処理をキャンセルします。

```typescript
// main.ts
import { createApp } from 'vue'
import { provideClient, withEndpoint } from '@defjs/vue'
import App from './App.vue'

createApp(App)
  .use(provideClient(withEndpoint('https://api.example.com')))
  .mount('#app')
```

```vue
<!-- UserName.vue -->
<script setup lang="ts">
import { ref, watch } from 'vue'
import { injectClient } from '@defjs/vue'
import { getUser } from './users-api'

const props = defineProps<{ id: number }>()
const client = injectClient()
const name = ref('')

watch(
  () => props.id,
  (id, _previous, onCleanup) => {
    const abort = new AbortController()
    onCleanup(() => abort.abort())

    void client.execute(getUser({ path: { id } }), { signal: abort.signal }).then(([error, user]) => {
      if (!abort.signal.aborted) {
        name.value = error ? '' : user.name
      }
    })
  },
  { immediate: true },
)
</script>

<template>
  <span>{{ name }}</span>
</template>
```

## React で組み合わせる

プロバイダーがクライアントスコープを作り、コンポーネントがエフェクトのキャンセルを所有します。

```tsx
// App.tsx
import { ClientProvider, withEndpoint } from '@defjs/react'
import { UserName } from './UserName'

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com')]}>
      <UserName id={7} />
    </ClientProvider>
  )
}
```

```tsx
// UserName.tsx
import { useEffect, useState } from 'react'
import { useClient } from '@defjs/react'
import { getUser } from './users-api'

export function UserName({ id }: { id: number }) {
  const client = useClient()
  const [name, setName] = useState('')

  useEffect(() => {
    const abort = new AbortController()

    void client.execute(getUser({ path: { id } }), { signal: abort.signal }).then(([error, user]) => {
      if (!abort.signal.aborted) {
        setName(error ? '' : user.name)
      }
    })

    return () => abort.abort()
  }, [client, id])

  return <span>{name}</span>
}
```

プロバイダーを破棄するだけでは処理をキャンセルしません。各コンポーネントが、自分で開始したリクエスト、ストリーム、セッションを所有します。

## 次に読む

- [Commands](/ja-JP/core/commands) — これらの例で使う定義
- [Interceptors](/ja-JP/core/interceptors) — 再試行と認証ポリシー
- [Vue](/ja-JP/plugins/vue) と [React](/ja-JP/plugins/react) — アダプター固有のスコープと SSR 境界

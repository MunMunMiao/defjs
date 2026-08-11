---
title: React
description: شارك Defjs client عبر React context، واضبطه للـ API، ونظّف requests وrealtime resources داخل effects.
---

# `@defjs/react`

هذه الحزمة محوّل Context خفيف لـ `@defjs/core`. يوفّر `ClientProvider` عميلاً أنشأه التطبيق، ويعيد `useClient()` أقرب نسخة. لا تضيف الحزمة مصنع عميل أو cache أو سياسة retry أو دورة حياة للموارد.

## توفير Client

أنشئ العميل واضبطه بواسطة `@defjs/core`، ثم مرّر النسخة صراحة:

```tsx
import { createClient, withEndpoint } from '@defjs/core'
import { ClientProvider } from '@defjs/react'
import { UserProfile } from './UserProfile'

const client = createClient(withEndpoint('https://api.example.com'))

export function App() {
  return (
    <ClientProvider client={client}>
      <UserProfile id={7} />
    </ClientProvider>
  )
}
```

يوفّر `ClientProvider` النسخة نفسها تماماً. يقرر المستدعي متى ينشئها أو يستبدلها، ويظل مسؤولاً عن الطلبات وموارد الوقت الحقيقي.

## قراءة أقرب Client

استدعِ `useClient()` داخل مكوّن React أو Hook مخصص. يرمي خطأ خارج provider، وتتبع providers المتداخلة قاعدة أقرب React Context.

```tsx
import { useClient } from '@defjs/react'

export function UserProfile() {
  const client = useClient()
  return null
}
```

تأتي جميع خيارات الإعداد من `@defjs/core`:

```tsx
import { createClient, withCredentials, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'), withCredentials(true))
```

## مصانع المعترضات

أنشئ قيم interceptor وركّبها بواسطة `withInterceptors(...)` من core قبل تمرير العميل إلى React:

```tsx
import { createClient, createHttpInterceptor, withEndpoint, withInterceptors } from '@defjs/core'
import { ClientProvider } from '@defjs/react'

const auth = createHttpInterceptor((request, next) => {
  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${readAccessToken()}`)
  return next({ ...request, headers })
})

const client = createClient(withEndpoint('https://api.example.com'), withInterceptors(auth))

export function ApiBoundary({ children }: { children: React.ReactNode }) {
  return <ClientProvider client={client}>{children}</ClientProvider>
}
```

إذا كان factory يلتقط بيانات اعتماد خاصة بالطلب، فاستدعه داخل حد الطلب الذي ينشئ العميل.

## إدارة دورة حياة تأثيرات HTTP

أنشئ cancellation داخل effect وتجاهل الاكتمال بعد cleanup:

```tsx
import { useEffect, useState } from 'react'
import { useClient } from '@defjs/react'
import { getUser } from './api'

export function UserProfile({ id }: { id: number }) {
  const client = useClient()
  const [name, setName] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const abort = new AbortController()

    void client
      .execute(getUser({ path: { id } }), { signal: abort.signal })
      .then(([error, user]) => {
        if (abort.signal.aborted) {
          return
        }

        if (error) {
          setErrorMessage('Unable to load user.')
          return
        }

        setErrorMessage('')
        setName(user.name)
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setErrorMessage('Unable to load user.')
        }
      })

    return () => abort.abort()
  }, [client, id])

  return errorMessage ? <p>{errorMessage}</p> : <p>{name}</p>
}
```

يعيد Defjs إخفاقات الطلب المتوقعة في tuples. لا تحوّل error إلى قيمة مرمية إلا عند حد تكامل يتوقع exceptions، مثل `queryFn` في query library.

## حد Client Component

مدخل الحزمة هو Client Component boundary. يمكن لغلاف يملكه التطبيق إنشاء عميل المتصفح وتمريره صراحة:

```tsx
// app/ApiProvider.tsx
'use client'

import { createClient, withEndpoint } from '@defjs/core'
import { ClientProvider } from '@defjs/react'
import type { ReactNode } from 'react'

const client = createClient(withEndpoint(process.env.NEXT_PUBLIC_API_ENDPOINT!))

export function ApiProvider({ children }: { children: ReactNode }) {
  return <ClientProvider client={client}>{children}</ClientProvider>
}
```

ينبغي لكود الخادم الذي يحمل headers أو cookies أو tenant state أو credentials إنشاء عميل منفصل داخل كل request boundary. لا يعزل المحوّل طلبات SSR المتزامنة ولا يتخلص من العمل الذي يملكه العميل.

## إدارة دورة حياة التأثيرات الفورية

لا يغلق provider unmount الموارد التي بدأها الأحفاد. يجب على effect تفتح WebSocket إلغاء startup، وإغلاق session تصل متأخرة، واستهلاك incoming queue، وإلغاء اشتراك observers، وإغلاق session النشطة.

```tsx
import { useEffect } from 'react'
import { useClient } from '@defjs/react'
import { openNotificationsSocket } from './api'
import { handleNotification } from './notifications'
import { recordRealtimeFailure } from './telemetry'

export function LiveNotifications() {
  const client = useClient()

  useEffect(() => {
    const abort = new AbortController()
    let disposed = false
    let closeActiveSession: ((reason: string) => void) | undefined

    void (async () => {
      const [error, session] = await client.execute(openNotificationsSocket(), {
        signal: abort.signal,
      })

      if (error) {
        if (!abort.signal.aborted) {
          recordRealtimeFailure({ operation: 'notifications-startup' })
        }
        return
      }

      const unsubscribeError = session.onRuntimeError(() => {
        recordRealtimeFailure({ operation: 'notifications' })
      })
      let closeRequested = false

      const closeSession = (reason: string) => {
        if (closeRequested) {
          return
        }
        closeRequested = true
        unsubscribeError()
        session.close(1000, reason)
      }
      closeActiveSession = closeSession

      if (disposed) {
        closeSession('effect-disposed')
        await session.closed
        return
      }

      try {
        for await (const message of session.receive) {
          if (disposed) {
            break
          }
          handleNotification(message)
        }
      } finally {
        closeSession('consumer-finished')
        await session.closed
      }
    })().catch(() => {
      if (!abort.signal.aborted) {
        recordRealtimeFailure({ operation: 'notifications-consumer' })
      }
    })

    return () => {
      disposed = true
      abort.abort()
      closeActiveSession?.('effect-disposed')
    }
  }, [client])

  return null
}
```

يفترض هذا fragment أن `recordRealtimeFailure` دالة telemetry يملكها التطبيق. وهو يستهلك `session.receive` عمدًا؛ ترك incoming queue المحدودة بلا قراءة يجعل overflow النهائي خطأً قاتلًا للجلسة. طبّق الانضباط نفسه في startup وcleanup على مقابض SSE.

يغيّر provider unmount/remount نطاق العميل. لكنه لا يستدعي `dispose` ولا يلغي requests ولا يغلق handles أو sessions، لأن core `Client` لا يملك lifecycle API من هذا النوع.

## API

```typescript
import type { Client } from '@defjs/core'
import type { JSX, ReactNode } from 'react'

interface ClientProviderProps {
  client: Client
  children?: ReactNode
}

declare function ClientProvider(props: ClientProviderProps): JSX.Element
declare function useClient(): Client
```

يوفّر العميل المحدد للأبناء. `children` اختياري.

يعيد أقرب عميل موفّر ويرمي خطأ عند غيابه.

## التالي

- تغطي [العميل](/ar/core/client) تركيب خيارات core ونطاقها.
- تغطي [الأخطاء](/ar/core/errors) حدود التكامل التي تحول tuple إلى exception.
- تغطي [SSE](/ar/core/sse) و[WebSocket](/ar/core/web-socket) ملكية موارد realtime.

---
title: React
description: شارك Defjs client عبر React context، واضبطه للـ API، ونظّف requests وrealtime resources داخل effects.
---

# `@defjs/react`

`@defjs/react` محول context خفيف لـ `@defjs/core`. وهو يصدّر:

- `ClientProvider`، الذي ينشئ core client ويوفّره؛
- `useClient()`، التي تعيد أقرب client موفّر؛
- مساعد adapter باسم `withEndpoint(...)` ومساعد `withInterceptors(...)` لمصانع المعترضات.

لا يضيف المحول caching أو تكامل Suspense أو query retries أو server data serialization. ثبّته إلى جانب `@defjs/core` وReact، واترك هذه المسؤوليات عالية المستوى لتطبيقك.

## توفير Client

```tsx
import { ClientProvider, withEndpoint } from '@defjs/react'
import { UserProfile } from './UserProfile'

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com')]}>
      <UserProfile id={7} />
    </ClientProvider>
  )
}
```

بعد تثبيت المزوّد، يحتفظ بعميل واحد طوال مدة تركيبه. لا تعيد عمليات التصيير العادية تطبيق مصفوفة `options` بعد تغييرها، ولا تستبدل العميل.

يستخدم التنفيذ مهيئًا كسولًا عبر `useState`. لا تفترض أن هذا المهيئ سيعمل مرة واحدة فقط في بيئة التطوير؛ فقد يقيّم React Strict Mode التهيئة أكثر من مرة أثناء التصيير قبل تثبيت المكوّن. المهم أن كل تركيب مكتمل للمزوّد يعرض عميلًا واحدًا ثابتًا طوال دورة حياته.

أعد mount للـ provider عندما يحتاج التطبيق عمدًا إلى client جديد:

```tsx
<ClientProvider key={tenantId} options={[withEndpoint(endpoint)]}>
  <TenantApplication />
</ClientProvider>
```

## قراءة أقرب Client

استدعِ `useClient()` داخل React component أو custom Hook:

```tsx
import { useClient } from '@defjs/react'

export function UserProfile({ id }: { id: number }) {
  const client = useClient()
  // Execute commands from effects, event handlers, or application integrations.
  return null
}
```

ترمي خارج provider. وتتبع nested providers سلوك React Context المعتاد؛ يحصل الأحفاد على client من أقرب provider.

يقبل `ClientProvider` أي `ClientOption` من core:

```tsx
import { withCredentials } from '@defjs/core'
import { ClientProvider, withEndpoint } from '@defjs/react'
import { Application } from './Application'

;<ClientProvider options={[withEndpoint('https://api.example.com'), withCredentials(true)]}>
  <Application />
</ClientProvider>
```

## مصانع المعترضات

تقبل `withInterceptors(...)` الخاصة بالمحول factories. تقيّمها عندما ينشئ provider عميله، وتُلحق نتائجها بترتيب الخيارات.

```tsx
import type { ReactNode } from 'react'
import { createHttpInterceptor } from '@defjs/core'
import { ClientProvider, withEndpoint, withInterceptors } from '@defjs/react'
import { readAccessToken } from './auth'

function createAuthInterceptor() {
  return createHttpInterceptor((request, next) => {
    const token = readAccessToken()
    if (!token) {
      return next(request)
    }

    const headers = new Headers(request.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return next({ ...request, headers })
  })
}

export function ApiBoundary({ children }: { children: ReactNode }) {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com'), withInterceptors(createAuthInterceptor)]}>{children}</ClientProvider>
  )
}
```

تقبل `withInterceptors(...)` في core قيم interceptor بدلًا من ذلك. أبقِ server credential factories داخل حد الطلب الذي يملك تلك credentials.

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

لا تنشئ الحزمة React Server Component client boundary نيابة عن تطبيقك. ضع `ClientProvider` خلف module يملكه التطبيق ويبدأ بـ `'use client'`.

أنشئ Client Component يملكه التطبيق:

```tsx
// app/ApiProvider.tsx
'use client'

import type { ReactNode } from 'react'
import { ClientProvider, withEndpoint } from '@defjs/react'

export function ApiProvider({ children }: { children: ReactNode }) {
  return <ClientProvider options={[withEndpoint(process.env.NEXT_PUBLIC_API_ENDPOINT!)]}>{children}</ClientProvider>
}
```

ينبغي لكود الخادم الذي يحمل request headers أو cookies أو tenant state أو user credentials إنشاء core client داخل حد كل server request. لا تلتقط هذه القيم في provider option على مستوى module أو singleton مشترك بين الطلبات. لا يوفر المحول عزلًا متزامنًا لـ SSR.

تضيف React Server Components وNext.js وhydration وStrict Mode وSSR المتزامن حدود lifecycle خاصة بالإطار. اختبر الإعداد الفعلي لتطبيقك، خصوصًا credentials ضمن نطاق request وإعادة mount للـ provider.

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

يفترض هذا fragment أن `recordRealtimeFailure` دالة telemetry يملكها التطبيق. وهو يستهلك `session.receive` عمدًا؛ ترك incoming queue غير المحدودة بلا قراءة ليس نمط ملكية صالحًا. طبّق الانضباط نفسه في startup وcleanup على مقابض SSE.

يغيّر provider unmount/remount نطاق العميل. لكنه لا يستدعي `dispose` ولا يلغي requests ولا يغلق handles أو sessions، لأن core `Client` لا يملك lifecycle API من هذا النوع.

## API

```typescript
import type { Client, ClientOption, Interceptor } from '@defjs/core'
import type { JSX, ReactNode } from 'react'

interface ClientProviderProps {
  children?: ReactNode
  options?: ClientOption[]
}

declare function ClientProvider(props: ClientProviderProps): JSX.Element
declare function useClient(): Client
declare function withEndpoint(endpoint: string): ClientOption
declare function withInterceptors(...factories: (() => Interceptor)[]): ClientOption
```

## التالي

- تغطي [العميل](/ar/core/client) تركيب خيارات core ونطاقها.
- تغطي [الأخطاء](/ar/core/errors) حدود التكامل التي تحول tuple إلى exception.
- تغطي [SSE](/ar/core/sse) و[WebSocket](/ar/core/web-socket) ملكية موارد realtime.

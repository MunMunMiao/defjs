---
title: Vue
description: شارك Defjs client عبر Vue injection، واضبطه للـ API، واحفظ SSR request scope، ونظّف transport resources.
---

# `@defjs/vue`

`@defjs/vue` محول injection خفيف لـ `@defjs/core`. وهو يصدّر:

- `provideClient(...)`، وهي Vue plugin تنشئ core client وتوفّره؛
- `injectClient()`، التي تعيد أقرب client محقون؛
- `HTTP_CLIENT`، وهو injection key المستخدم للتجاوزات؛
- مساعد adapter باسم `withEndpoint(...)` ومساعد `withInterceptors(...)` لمصانع المعترضات.

لا يضيف المحول سلوك transport أو caching أو state management أو retries أو Nuxt module. ثبّته إلى جانب `@defjs/core` وVue، وضع هذه المسؤوليات داخل composables وstores وتكاملات framework في تطبيقك.

## تثبيت Plugin

ينشئ كل تثبيت للـ plugin عميلًا واحدًا:

```typescript
// main.ts
import { createApp } from 'vue'
import { provideClient, withEndpoint } from '@defjs/vue'
import App from './App.vue'

const app = createApp(App)

app.use(provideClient(withEndpoint('https://api.example.com')))

app.mount('#app')
```

تقبل `provideClient(...options)` أي `ClientOption` من `@defjs/core`، لا الخيارات التي يعيد المحول تصديرها أو إنشاءها فقط:

```typescript
import { withCredentials, withSSEReconnect } from '@defjs/core'
import { provideClient, withEndpoint } from '@defjs/vue'

app.use(provideClient(withEndpoint('https://api.example.com'), withCredentials(true), withSSEReconnect({ attempts: 3 })))
```

تعمل الخيارات عندما تُثبّت plugin وتنشئ العميل. ويؤدي تثبيت plugin object نفسه في تطبيق آخر إلى إنشاء عميل آخر.

## حقن أقرب عميل

استدعِ `injectClient()` داخل component `setup` أو `<script setup>` أو composable/injection context نشط:

```vue
<script setup lang="ts">
import { injectClient } from '@defjs/vue'

const client = injectClient()
</script>
```

ترمي الدالة إذا لم يتوفر `HTTP_CLIENT`. لا تستدعها في module scope اعتباطي.

تنطبق قاعدة Vue المعتادة لأقرب provider. يستطيع component توفير override لأحفاده:

```vue
<script setup lang="ts">
import { provide } from 'vue'
import { createClient, withEndpoint } from '@defjs/core'
import { HTTP_CLIENT } from '@defjs/vue'

const scopedClient = createClient(withEndpoint('https://preview.example.com'))
provide(HTTP_CLIENT, scopedClient)
</script>

<template>
  <slot />
</template>
```

يحصل الأحفاد الذين يستدعون `injectClient()` على `scopedClient`، بينما يستمر siblings خارج هذه الشجرة الفرعية في الحصول على client مستوى التطبيق.

## مصانع المعترضات

تقبل `withInterceptors(...)` الخاصة بالمحول factories لا interceptor instances. تقيّم هذه المصانع عند إنشاء client، وتُلحق نتائجها بترتيب الخيارات.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import { provideClient, withEndpoint, withInterceptors } from '@defjs/vue'
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

app.use(provideClient(withEndpoint('https://api.example.com'), withInterceptors(createAuthInterceptor)))
```

يختلف هذا عن `withInterceptors(...)` في core، التي تقبل قيم interceptor منشأة مسبقًا. أبقِ factories التي تلتقط server credentials ضمن نطاق الطلب.

## الاستجابة لتغير Input

اربط عمل HTTP بالقيمة التفاعلية التي بدأته. تقرأ `onMounted` وحدها prop الأولى فقط. يلغي `watch` مع cleanup العمل الذي تجاوزه تغيير لاحق:

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import { injectClient } from '@defjs/vue'
import { getUser } from './api'

const props = defineProps<{ id: number }>()
const client = injectClient()
const name = ref('')
const errorMessage = ref('')

watch(
  () => props.id,
  (id, _previousId, onCleanup) => {
    const abort = new AbortController()
    let current = true

    onCleanup(() => {
      current = false
      abort.abort()
    })

    void client
      .execute(getUser({ path: { id } }), { signal: abort.signal })
      .then(([error, user]) => {
        if (!current) {
          return
        }

        if (error) {
          errorMessage.value = 'Unable to load user.'
          return
        }

        errorMessage.value = ''
        name.value = user.name
      })
      .catch(() => {
        if (current) {
          errorMessage.value = 'Unable to load user.'
        }
      })
  },
  { immediate: true },
)
</script>

<template>
  <p v-if="errorMessage">{{ errorMessage }}</p>
  <p v-else>{{ name }}</p>
</template>
```

يملك منشئ الأمر `getUser` المستورد عقد نقطة النهاية. ويملك هذا component الإلغاء عندما يتغير `id` أو يُزال component.

## حدود SSR

يستطيع تطبيق متصفح تثبيت plugin client واحد عندما يكون إعداده آمنًا للمتصفح ومستقلًا عن الطلب.

في SSR، لا تلتقط request headers أو cookies أو user data أو tenant data داخل app singleton مشترك بين الطلبات. أنشئ core client داخل حد كل server request ومرّره أو وفّره داخل render tree الخاصة بذلك الطلب فقط.

لا يعزل المحول application closures بين طلبات SSR المتزامنة. كما لا يقرر أي inbound headers أو cookies آمنة للتمرير.

تستطيع Nuxt client plugin تثبيت Vue adapter لمستهلكي المتصفح:

```typescript
// plugins/defjs.client.ts
import { provideClient, withEndpoint } from '@defjs/vue'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(provideClient(withEndpoint(useRuntimeConfig().public.apiBase)))
})
```

تجعل اللاحقة `.client.ts` هذا الملف خاصًا بالمتصفح. فهو ليس client ضمن نطاق server request ويجب ألا يُستخدم لتمرير SSR credentials. في تطبيق Nuxt، اختبر هذا الحد مع plugins وroute handlers وhydration الفعلية.

## ملكية الموارد

لا يؤدي تثبيت أو unmount لـ Vue provider إلى إلغاء عمل HTTP أو إغلاق موارد SSE وWebSocket. ينشئ المحول client، ولا يملك core client دالة `dispose()`.

يجب على component أو composable أو route أو store الذي يبدأ عمل realtime أن:

- يسجّل cleanup قبل startup غير المتزامن أو بالتزامن معه؛
- يلغي startup عند انتهاء نطاقه؛
- يغلق handle أو session تصل بعد disposal؛
- يستهلك `stream` أو `session.receive` باستمرار؛
- يستدعي `stream.close(...)` أو `session.close(...)` للمورد النشط؛
- يلغي اشتراك WebSocket observers.

لا تفتح WebSocket لمجرد ربط state listener ثم تترك incoming queue غير المحدودة بلا قراءة. راجع [SSE](/ar/core/sse) و[WebSocket](/ar/core/web-socket) لقواعد دورة الحياة الكاملة.

## API

```typescript
import type { Client, ClientOption, Interceptor } from '@defjs/core'
import type { InjectionKey, Plugin } from 'vue'

declare const HTTP_CLIENT: InjectionKey<Client>
declare function provideClient(...options: ClientOption[]): Plugin
declare function injectClient(): Client
declare function withEndpoint(endpoint: string): ClientOption
declare function withInterceptors(...factories: (() => Interceptor)[]): ClientOption
```

## التالي

- تغطي [العميل](/ar/core/client) تركيب خيارات core ونطاق العميل.
- تغطي [الأوامر](/ar/core/commands) تعريفات نقاط النهاية وcommand input.
- تغطي [المعترضات](/ar/core/interceptors) عقد interceptor في core.

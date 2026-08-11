---
title: Vue
description: شارك Defjs client عبر Vue injection، واضبطه للـ API، واحفظ SSR request scope، ونظّف transport resources.
---

# `@defjs/vue`

هذه الحزمة محوّل injection خفيف لـ `@defjs/core`. يوفّر `createClientPlugin(client)` عميلاً أنشأه التطبيق، ويعيد `injectClient()` أقرب نسخة، ويدعم `HTTP_CLIENT` تجاوزات subtree الأصلية. لا تضيف مصنع عميل أو cache أو retry أو دورة حياة للموارد.

## تثبيت Plugin

أنشئ العميل واضبطه بواسطة `@defjs/core`، ثم ثبّت plugin لهذه النسخة نفسها:

```typescript
// main.ts
import { createClient, withEndpoint } from '@defjs/core'
import { createClientPlugin } from '@defjs/vue'
import { createApp } from 'vue'
import App from './App.vue'

const client = createClient(withEndpoint('https://api.example.com'))
const app = createApp(App)

app.use(createClientPlugin(client))
app.mount('#app')
```

لا يفعل plugin سوى توفير النسخة المحددة؛ ولا ينشئ العميل أو ينسخه أو يستبدله أو يتخلص منه.

## حقن أقرب عميل

استدعِ `injectClient()` داخل `setup` أو `<script setup>` أو injection context نشط. يرمي خطأ عند غياب `HTTP_CLIENT`، وتطبق Vue قاعدة أقرب provider.

استخدم المفتاح العام مع `provide` الأصلي من Vue لتجاوز subtree:

```vue
<script setup lang="ts">
import { createClient, withEndpoint } from '@defjs/core'
import { HTTP_CLIENT } from '@defjs/vue'
import { provide } from 'vue'

const scopedClient = createClient(withEndpoint('https://preview.example.com'))
provide(HTTP_CLIENT, scopedClient)
</script>

<template>
  <slot />
</template>
```

## مصانع المعترضات

أنشئ قيم interceptor وركّبها بواسطة `withInterceptors(...)` من core قبل تثبيت plugin:

```typescript
import { createClient, createHttpInterceptor, withEndpoint, withInterceptors } from '@defjs/core'
import { createClientPlugin } from '@defjs/vue'

const auth = createHttpInterceptor((request, next) => {
  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${readAccessToken()}`)
  return next({ ...request, headers })
})

const client = createClient(withEndpoint('https://api.example.com'), withInterceptors(auth))
app.use(createClientPlugin(client))
```

إذا كان factory يلتقط بيانات اعتماد خاصة بالطلب، فاستدعه داخل حد الطلب الذي ينشئ العميل.

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

يمكن لتطبيق المتصفح تثبيت عميل آمن للمتصفح. في SSR أنشئ core client منفصلاً داخل كل request boundary وقدّم تلك النسخة للتطبيق المقابل؛ لا تشارك headers أو cookies أو tenant state أو credentials بين الطلبات.

```typescript
// plugins/defjs.client.ts
import { createClient, withEndpoint } from '@defjs/core'
import { createClientPlugin } from '@defjs/vue'

export default defineNuxtPlugin((nuxtApp) => {
  const client = createClient(withEndpoint(useRuntimeConfig().public.apiBase))
  nuxtApp.vueApp.use(createClientPlugin(client))
})
```

## ملكية الموارد

تثبيت plugin أو إلغاء تركيبه لا يوقف HTTP ولا يغلق موارد SSE وWebSocket. المستدعي الذي ينشئ العميل يملك كل العمل الذي يبدأ عبره.

- يسجّل cleanup قبل startup غير المتزامن أو بالتزامن معه؛
- يلغي startup عند انتهاء نطاقه؛
- يغلق handle أو session تصل بعد disposal؛
- يستهلك `stream` أو `session.receive` باستمرار؛
- يستدعي `stream.close(...)` أو `session.close(...)` للمورد النشط؛
- يلغي اشتراك WebSocket observers.

لا تفتح WebSocket لمجرد ربط state listener ثم تترك incoming queue المحدودة بلا قراءة؛ فالـ overflow قاتل للجلسة. راجع [SSE](/ar/core/sse) و[WebSocket](/ar/core/web-socket) لقواعد دورة الحياة الكاملة.

## API

```typescript
import type { Client } from '@defjs/core'
import type { InjectionKey, Plugin } from 'vue'

declare const HTTP_CLIENT: InjectionKey<Client>
declare function createClientPlugin(client: Client): Plugin
declare function injectClient(): Client
```

ينشئ Vue plugin يوفّر نسخة العميل المحددة.

يعيد أقرب عميل موفّر ويرمي خطأ عند غيابه.

مفتاح injection عام لـ native subtree providers.

## التالي

- تغطي [العميل](/ar/core/client) تركيب خيارات core ونطاق العميل.
- تغطي [الأوامر](/ar/core/commands) تعريفات نقاط النهاية وcommand input.
- تغطي [المعترضات](/ar/core/interceptors) عقد interceptor في core.

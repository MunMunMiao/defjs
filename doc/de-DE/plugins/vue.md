---
title: Vue
description: Teile einen Defjs-Client über Vue Injection, konfiguriere ihn für deine API, wahre den SSR-Request-Scope und räume Transportressourcen auf.
---

# `@defjs/vue`

Dieses Paket ist ein dünner Injection-Adapter für `@defjs/core`. `createClientPlugin(client)` stellt einen von der Anwendung erzeugten Client bereit, `injectClient()` liefert die nächstgelegene Instanz, und `HTTP_CLIENT` ermöglicht native Subtree-Overrides. Es fügt weder Client-Factory noch Cache, Retry-Policy oder Ressourcen-Lifecycle hinzu.

## Plugin installieren

Erzeuge und konfiguriere den Client mit `@defjs/core` und installiere dann ein Plugin für exakt diese Instanz:

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

Das Plugin stellt nur die übergebene Instanz bereit. Es erzeugt, kopiert, ersetzt oder entsorgt den Client nicht.

## Nächstgelegenen Client injizieren

Rufe `injectClient()` in `setup`, `<script setup>` oder einem aktiven Injection-Kontext auf. Ohne `HTTP_CLIENT` wird ein Fehler ausgelöst; es gilt Vues normale Nearest-Provider-Regel.

Nutze den öffentlichen Schlüssel mit Vues nativem `provide` für einen Subtree-Override:

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

## Interceptor-Factorys

Erzeuge Interceptor-Werte und kombiniere sie mit dem Core-`withInterceptors(...)`, bevor du das Plugin installierst:

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

Wenn eine Factory request-spezifische Zugangsdaten erfasst, rufe sie innerhalb der Request-Grenze auf, die den Client erzeugt.

## Auf Eingabeänderungen reagieren

Binde HTTP-Arbeit an den reaktiven Wert, der sie auslöst. `onMounted` allein liest nur das erste Prop. `watch` mit Cleanup bricht überholte Arbeit ab:

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

Der importierte Command-Builder `getUser` definiert den Endpunktvertrag. Diese Komponente ist für den Abbruch bei einer Änderung von `id` oder beim Unmount verantwortlich.

## SSR-Grenzen

Eine Browser-App kann einen browser-sicheren Client installieren. Für SSR muss jede Server-Request-Grenze einen eigenen Core-Client erzeugen und nur diese Instanz an die zugehörige App geben; Header, Cookies, Tenant-Zustand und Zugangsdaten dürfen nicht geteilt werden.

```typescript
// plugins/defjs.client.ts
import { createClient, withEndpoint } from '@defjs/core'
import { createClientPlugin } from '@defjs/vue'

export default defineNuxtPlugin((nuxtApp) => {
  const client = createClient(withEndpoint(useRuntimeConfig().public.apiBase))
  nuxtApp.vueApp.use(createClientPlugin(client))
})
```

## Verantwortung für Ressourcen

Installation oder Unmount des Plugins bricht keine HTTP-Arbeit ab und schließt keine SSE- oder WebSocket-Ressourcen. Der Aufrufer, der den Client erzeugt, besitzt alle damit gestarteten Arbeiten.

- Cleanup vor oder parallel zum asynchronen Start registrieren;
- den Start abbrechen, wenn der Scope endet;
- einen Handle oder eine Session schließen, die erst nach dem Cleanup eintrifft;
- `stream` oder `session.receive` fortlaufend konsumieren;
- für eine aktive Ressource `stream.close(...)` oder `session.close(...)` aufrufen;
- WebSocket-Beobachter entfernen.

Öffne keinen WebSocket nur für einen Zustandslistener, während die begrenzte eingehende Warteschlange ungelesen bleibt; Overflow beendet die Session fatal. [SSE](/de-DE/core/sse) und [WebSocket](/de-DE/core/web-socket) beschreiben die vollständigen Lebenszyklusregeln.

## API

```typescript
import type { Client } from '@defjs/core'
import type { InjectionKey, Plugin } from 'vue'

declare const HTTP_CLIENT: InjectionKey<Client>
declare function createClientPlugin(client: Client): Plugin
declare function injectClient(): Client
```

Erzeugt ein Vue-Plugin, das die übergebene Client-Instanz bereitstellt.

Liefert den nächstgelegenen Client und wirft ohne Provider einen Fehler.

Öffentlicher Injection-Key für native Subtree-Provider.

## Weiter

- [Client](/de-DE/core/client) behandelt Core-Optionskomposition und Client-Scope.
- [Commands](/de-DE/core/commands) behandelt Endpunktdefinitionen und Command-Eingaben.
- [Interceptors](/de-DE/core/interceptors) erklärt den Core-Interceptor-Vertrag.

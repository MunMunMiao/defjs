---
title: Vue
description: Teile einen Defjs-Client über Vue Injection, konfiguriere ihn für deine API, wahre den SSR-Request-Scope und räume Transportressourcen auf.
---

# `@defjs/vue`

`@defjs/vue` ist ein schlanker Injection-Adapter für `@defjs/core`. Das Paket exportiert:

- `provideClient(...)`, ein Vue-Plugin, das einen Core-Client erzeugt und bereitstellt;
- `injectClient()`, das den nächstgelegenen injizierten Client zurückgibt;
- `HTTP_CLIENT`, den Injection-Key für Overrides;
- die Adapter-Helper `withEndpoint(...)` und `withInterceptors(...)` mit Interceptor-Factorys.

Der Adapter fügt weder Transportverhalten, Caching, State Management oder Retries noch ein Nuxt-Modul hinzu. Installiere ihn zusammen mit `@defjs/core` und Vue; diese Aufgaben gehören in die Composables, Stores und Framework-Integrationen deiner Anwendung.

## Plugin installieren

Jede Installation des Plugins erzeugt einen Client:

```typescript
// main.ts
import { createApp } from 'vue'
import { provideClient, withEndpoint } from '@defjs/vue'
import App from './App.vue'

const app = createApp(App)

app.use(provideClient(withEndpoint('https://api.example.com')))

app.mount('#app')
```

`provideClient(...options)` akzeptiert jede `ClientOption` aus `@defjs/core`, nicht nur Optionen, die der Vue-Adapter erneut exportiert oder erzeugt:

```typescript
import { withCredentials, withSSEReconnect } from '@defjs/core'
import { provideClient, withEndpoint } from '@defjs/vue'

app.use(provideClient(withEndpoint('https://api.example.com'), withCredentials(true), withSSEReconnect({ attempts: 3 })))
```

Die Optionen laufen bei der Plugin-Installation, wenn der Client erzeugt wird. Installierst du dasselbe Plugin-Objekt in einer weiteren App, entsteht ein weiterer Client.

## Nächstgelegenen Client injizieren

Rufe `injectClient()` in Komponenten-`setup`, `<script setup>` oder einem aktiven Composable- bzw. Injection-Context auf:

```vue
<script setup lang="ts">
import { injectClient } from '@defjs/vue'

const client = injectClient()
</script>
```

Die Funktion wirft, wenn kein `HTTP_CLIENT` verfügbar ist. Rufe sie nicht beliebig auf Modulebene auf.

Es gilt Vues normale Regel des nächstgelegenen Providers. Eine Komponente kann für ihre Nachkommen einen Override bereitstellen:

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

Nachkommen erhalten bei `injectClient()` den `scopedClient`; Geschwister außerhalb dieses Teilbaums verwenden weiterhin den Client auf App-Ebene.

## Interceptor-Factorys

Das Adapter-eigene `withInterceptors(...)` akzeptiert Factorys statt Interceptor-Instanzen. Es wertet sie bei der Client-Erzeugung aus und hängt die Ergebnisse in Optionsreihenfolge an.

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

Das unterscheidet sich vom Core-`withInterceptors(...)`, das bereits erzeugte Interceptor-Werte akzeptiert. Halte Factorys mit Server-Credentials innerhalb des zugehörigen Request-Scopes.

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

Eine Browseranwendung kann einen Plugin-Client installieren, wenn seine Konfiguration browsersicher und Request-unabhängig ist.

Halte bei SSR keine Request-Header, Cookies, Benutzer- oder Mandantendaten in einem App-Singleton, das mehrere Requests teilt. Erzeuge innerhalb jeder Server-Request-Grenze einen Core-Client und reiche ihn nur im Renderbaum dieses Requests weiter oder stelle ihn dort bereit.

Der Adapter isoliert Anwendungs-Closures nicht zwischen parallelen SSR-Requests. Er entscheidet auch nicht, welche eingehenden Header oder Cookies sicher weitergeleitet werden dürfen.

Ein Nuxt-Client-Plugin kann den Vue-Adapter für Browser-Consumer installieren:

```typescript
// plugins/defjs.client.ts
import { provideClient, withEndpoint } from '@defjs/vue'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(provideClient(withEndpoint(useRuntimeConfig().public.apiBase)))
})
```

Die Endung `.client.ts` macht das Plugin browserspezifisch. Es ist kein Client für Server-Requests und darf keine SSR-Credentials weiterleiten. Teste diese Grenze in einer Nuxt-Anwendung zusammen mit den tatsächlich verwendeten Plugins, Route-Handlern und der Hydration.

## Verantwortung für Ressourcen

Installation oder Unmount eines Vue-Providers bricht keine HTTP-Arbeit ab und schließt keine SSE- oder WebSocket-Ressourcen. Der Adapter erzeugt einen Client; Core-Clients haben keine Methode `dispose()`.

Die Komponente, das Composable, die Route oder der Store, die Echtzeitarbeit starten, müssen:

- Cleanup vor oder parallel zum asynchronen Start registrieren;
- den Start abbrechen, wenn der Scope endet;
- einen Handle oder eine Session schließen, die erst nach dem Cleanup eintrifft;
- `stream` oder `session.receive` fortlaufend konsumieren;
- für eine aktive Ressource `stream.close(...)` oder `session.close(...)` aufrufen;
- WebSocket-Beobachter entfernen.

Öffne keinen WebSocket nur für einen Zustandslistener, während die unbegrenzte eingehende Warteschlange ungelesen bleibt. [SSE](/de-DE/core/sse) und [WebSocket](/de-DE/core/web-socket) beschreiben die vollständigen Lebenszyklusregeln.

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

## Weiter

- [Client](/de-DE/core/client) behandelt Core-Optionskomposition und Client-Scope.
- [Commands](/de-DE/core/commands) behandelt Endpunktdefinitionen und Command-Eingaben.
- [Interceptors](/de-DE/core/interceptors) erklärt den Core-Interceptor-Vertrag.

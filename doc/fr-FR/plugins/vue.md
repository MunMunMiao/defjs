---
title: Vue
description: Partagez un client Defjs par injection Vue, configurez-le pour votre API, conservez le scope de requête SSR et nettoyez les transports.
---

# `@defjs/vue`

`@defjs/vue` est un adaptateur d'injection léger pour `@defjs/core`. Il exporte :

- `provideClient(...)`, un plugin Vue qui crée et fournit un client Core ;
- `injectClient()`, qui renvoie le client injecté le plus proche ;
- `HTTP_CLIENT`, la clé d'injection utilisée pour les remplacements locaux ;
- les helpers d'adaptateur `withEndpoint(...)` et `withInterceptors(...)`, ce dernier acceptant des fabriques d'intercepteurs.

Il n'ajoute ni comportement de transport, ni cache, ni gestion d'état, ni relance, ni module Nuxt. Installez-le avec `@defjs/core` et Vue, puis gardez ces responsabilités dans les composables, stores et intégrations de votre application.

## Installer le plugin

Chaque installation du plugin crée un client :

```typescript
// main.ts
import { createApp } from 'vue'
import { provideClient, withEndpoint } from '@defjs/vue'
import App from './App.vue'

const app = createApp(App)

app.use(provideClient(withEndpoint('https://api.example.com')))

app.mount('#app')
```

`provideClient(...options)` accepte tout `ClientOption` de `@defjs/core`, pas uniquement les options réexportées ou recréées par l'adaptateur Vue :

```typescript
import { withCredentials, withSSEReconnect } from '@defjs/core'
import { provideClient, withEndpoint } from '@defjs/vue'

app.use(provideClient(withEndpoint('https://api.example.com'), withCredentials(true), withSSEReconnect({ attempts: 3 })))
```

Les options s'exécutent à l'installation du plugin, au moment où il crée le client. Installer le même objet plugin dans une autre application crée un autre client.

## Injecter le client le plus proche

Appelez `injectClient()` dans le `setup` d'un composant, dans `<script setup>` ou dans un contexte de composable/injection actif :

```vue
<script setup lang="ts">
import { injectClient } from '@defjs/vue'

const client = injectClient()
</script>
```

La fonction lève une exception si aucun `HTTP_CLIENT` n'est disponible. Ne l'appelez pas arbitrairement au niveau d'un module.

La règle Vue du provider le plus proche s'applique. Un composant peut fournir un client différent à ses descendants :

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

Les descendants qui appellent `injectClient()` reçoivent `scopedClient` ; les composants voisins hors de ce sous-arbre conservent le client de l'application.

## Fabriques d'intercepteurs

Le `withInterceptors(...)` de l'adaptateur accepte des fabriques, pas des instances d'intercepteur. Il les évalue lors de la création du client et ajoute leurs résultats dans l'ordre des options.

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

Ce comportement diffère du `withInterceptors(...)` Core, qui accepte des intercepteurs déjà créés. Gardez les fabriques qui capturent des identifiants serveur dans la portée de la requête.

## Réagir aux changements d'entrée

Liez la requête HTTP à la valeur réactive qui la déclenche. `onMounted` seul ne lit que la prop initiale. Un `watch` avec nettoyage annule la requête devenue obsolète :

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

Le constructeur de commande `getUser` importé possède le contrat de l'endpoint. Ce composant est responsable de l'annulation lorsque `id` change ou que le composant est démonté.

## Frontières SSR

Une application navigateur peut installer un unique client avec le plugin si sa configuration convient au navigateur et ne dépend pas d'une requête.

Pour le SSR, ne capturez pas les en-têtes, cookies, données utilisateur ou données de tenant dans un singleton partagé entre les requêtes. Créez un client Core dans la portée de chaque requête serveur, puis transmettez-le uniquement à l'arbre de rendu correspondant.

L'adaptateur n'isole pas les fonctions applicatives qui capturent un état entre des requêtes SSR concurrentes. Il ne décide pas non plus quels en-têtes ou cookies entrants peuvent être transmis sans risque.

Un plugin client Nuxt peut installer l'adaptateur Vue pour les consommateurs du navigateur :

```typescript
// plugins/defjs.client.ts
import { provideClient, withEndpoint } from '@defjs/vue'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(provideClient(withEndpoint(useRuntimeConfig().public.apiBase)))
})
```

Le suffixe `.client.ts` réserve ce code au navigateur. Ce client n'appartient pas à une requête serveur et ne doit pas transmettre d'identifiants SSR. Dans une application Nuxt, testez cette frontière avec vos plugins, route handlers et votre configuration d'hydratation réels.

## Responsabilité des ressources

Installer ou démonter un provider Vue n'annule aucune requête HTTP et ne ferme aucune ressource SSE ou WebSocket. L'adaptateur crée un client, et un client Core n'a pas de méthode `dispose()`.

Le composant, composable, route ou store qui démarre un travail temps réel doit :

- enregistrer le nettoyage avant ou en même temps que le démarrage asynchrone ;
- annuler le démarrage lorsque sa portée prend fin ;
- fermer un handle ou une session qui arrive après la destruction ;
- consommer en continu `stream` ou `session.receive` ;
- appeler `stream.close(...)` ou `session.close(...)` pour une ressource active ;
- désinscrire les observateurs WebSocket.

N'ouvrez pas une WebSocket uniquement pour attacher un listener d'état tout en laissant sa file entrante non bornée sans lecteur. Consultez [SSE](/fr-FR/core/sse) et [WebSocket](/fr-FR/core/web-socket) pour les règles complètes de cycle de vie.

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

## Étapes suivantes

- [Client](/fr-FR/core/client) couvre la composition des options Core et la portée du client.
- [Commandes](/fr-FR/core/commands) couvre les définitions d'endpoint et les entrées de commande.
- [Intercepteurs](/fr-FR/core/interceptors) couvre le contrat d'intercepteur Core.

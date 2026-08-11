---
title: Vue
description: Partagez un client Defjs par injection Vue, configurez-le pour votre API, conservez le scope de requête SSR et nettoyez les transports.
---

# `@defjs/vue`

Ce paquet est un adaptateur d’injection minimal pour `@defjs/core`. `createClientPlugin(client)` fournit un client créé par l’application, `injectClient()` renvoie l’instance la plus proche et `HTTP_CLIENT` permet les overrides natifs d’un sous-arbre. Il n’ajoute ni fabrique, ni cache, ni retry, ni cycle de vie des ressources.

## Installer le plugin

Créez et configurez le client avec `@defjs/core`, puis installez un plugin pour cette instance exacte :

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

Le plugin ne fait que fournir l’instance reçue ; il ne crée, clone, remplace ou libère pas le client.

## Injecter le client le plus proche

Appelez `injectClient()` dans `setup`, `<script setup>` ou un contexte d’injection actif. Un appel sans `HTTP_CLIENT` lève une erreur et la règle Vue du provider le plus proche s’applique.

Utilisez la clé publique avec le `provide` natif de Vue pour remplacer le client d’un sous-arbre :

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

## Fabriques d'intercepteurs

Créez les valeurs interceptor et composez-les avec le `withInterceptors(...)` du core avant d’installer le plugin :

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

Si une fabrique capture des identifiants propres à une requête, appelez-la dans la frontière de requête qui crée ce client.

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

Une application navigateur peut installer un client sûr pour le navigateur. En SSR, créez un core client distinct dans chaque frontière de requête et ne fournissez que cette instance à l’application correspondante ; ne partagez ni headers, ni cookies, ni état de tenant, ni identifiants.

```typescript
// plugins/defjs.client.ts
import { createClient, withEndpoint } from '@defjs/core'
import { createClientPlugin } from '@defjs/vue'

export default defineNuxtPlugin((nuxtApp) => {
  const client = createClient(withEndpoint(useRuntimeConfig().public.apiBase))
  nuxtApp.vueApp.use(createClientPlugin(client))
})
```

## Responsabilité des ressources

Installer ou démonter le plugin n’annule pas les travaux HTTP et ne ferme pas les ressources SSE ou WebSocket. L’appelant qui crée le client possède tout le travail démarré avec lui.

- enregistrer le nettoyage avant ou en même temps que le démarrage asynchrone ;
- annuler le démarrage lorsque sa portée prend fin ;
- fermer un handle ou une session qui arrive après la destruction ;
- consommer en continu `stream` ou `session.receive` ;
- appeler `stream.close(...)` ou `session.close(...)` pour une ressource active ;
- désinscrire les observateurs WebSocket.

N'ouvrez pas une WebSocket uniquement pour attacher un listener d'état tout en laissant sa file entrante bornée sans lecteur ; son overflow termine fatalement la session. Consultez [SSE](/fr-FR/core/sse) et [WebSocket](/fr-FR/core/web-socket) pour les règles complètes de cycle de vie.

## API

```typescript
import type { Client } from '@defjs/core'
import type { InjectionKey, Plugin } from 'vue'

declare const HTTP_CLIENT: InjectionKey<Client>
declare function createClientPlugin(client: Client): Plugin
declare function injectClient(): Client
```

Crée un plugin Vue qui fournit l’instance client reçue.

Renvoie le client le plus proche et lève une erreur s’il n’existe pas.

Clé d’injection publique pour les providers natifs de sous-arbre.

## Étapes suivantes

- [Client](/fr-FR/core/client) couvre la composition des options Core et la portée du client.
- [Commandes](/fr-FR/core/commands) couvre les définitions d'endpoint et les entrées de commande.
- [Intercepteurs](/fr-FR/core/interceptors) couvre le contrat d'intercepteur Core.

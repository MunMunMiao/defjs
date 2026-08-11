---
title: Vue
description: Comparte un cliente Defjs mediante la inyección de Vue, configúralo para tu API, conserva el ámbito de petición SSR y libera los transportes.
---

# `@defjs/vue`

Este paquete es un adaptador de injection ligero para `@defjs/core`. `createClientPlugin(client)` proporciona un cliente creado por la aplicación, `injectClient()` devuelve la instancia más cercana y `HTTP_CLIENT` permite overrides nativos en subárboles. No añade factoría de clientes, caché, reintentos ni ciclo de vida de recursos.

## Instalar el plugin

Crea y configura el cliente con `@defjs/core` e instala un plugin para esa misma instancia:

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

El plugin solo proporciona la instancia recibida; no crea, clona, sustituye ni libera el cliente.

## Inyectar el cliente más cercano

Llama a `injectClient()` en `setup`, `<script setup>` o un contexto de injection activo. Lanza un error sin `HTTP_CLIENT` y aplica la regla normal del provider más cercano de Vue.

Usa la clave pública con el `provide` nativo de Vue para un override de subárbol:

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

## Funciones de creación de interceptores

Crea valores interceptor y compónlos con `withInterceptors(...)` de core antes de instalar el plugin:

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

Si una factoría captura credenciales de una petición, ejecútala dentro del límite de esa petición al crear el cliente.

## Reaccionar a cambios en la entrada

Vincula el trabajo HTTP al valor reactivo que lo inicia. `onMounted` por sí solo solo lee la prop inicial. Un `watch` con función de limpieza cancela el trabajo que haya quedado obsoleto:

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

El constructor de comandos `getUser` importado conserva el contrato del endpoint. Este componente se encarga de cancelar cuando cambia `id` o se desmonta.

## Límites SSR

Una aplicación de navegador puede instalar un cliente seguro para el navegador. En SSR, crea un core client independiente por petición y proporciona solo esa instancia a su aplicación; no compartas headers, cookies, estado de tenant ni credenciales.

```typescript
// plugins/defjs.client.ts
import { createClient, withEndpoint } from '@defjs/core'
import { createClientPlugin } from '@defjs/vue'

export default defineNuxtPlugin((nuxtApp) => {
  const client = createClient(withEndpoint(useRuntimeConfig().public.apiBase))
  nuxtApp.vueApp.use(createClientPlugin(client))
})
```

## Responsabilidad sobre los recursos

Instalar o desmontar el plugin no cancela HTTP ni cierra recursos SSE o WebSocket. El llamador que crea el cliente es responsable de todo el trabajo iniciado con él.

- registrar la limpieza antes o durante el arranque asíncrono;
- cancelar el arranque cuando termine su ámbito;
- cerrar un manejador o una sesión que llegue después de haberse liberado ese ámbito;
- consumir continuamente `stream` o `session.receive`;
- llamar a `stream.close(...)` o `session.close(...)` cuando el recurso esté activo;
- dar de baja los observadores WebSocket.

No abras un WebSocket solo para añadir un listener de estado y dejar sin leer su cola de entrada finita; el desbordamiento termina la sesión de forma fatal. Consulta [SSE](/es-ES/core/sse) y [WebSocket](/es-ES/core/web-socket) para ver las reglas completas del ciclo de vida.

## API

```typescript
import type { Client } from '@defjs/core'
import type { InjectionKey, Plugin } from 'vue'

declare const HTTP_CLIENT: InjectionKey<Client>
declare function createClientPlugin(client: Client): Plugin
declare function injectClient(): Client
```

Crea un plugin Vue que proporciona la instancia de cliente recibida.

Devuelve el cliente más cercano y lanza un error si no existe.

Clave de injection pública para providers nativos de subárbol.

## Siguiente paso

- [Client](/es-ES/core/client) cubre la composición de opciones de Core y el ámbito del cliente.
- [Comandos](/es-ES/core/commands) cubre las definiciones de endpoint y la entrada de los comandos.
- [Interceptores](/es-ES/core/interceptors) cubre el contrato de interceptores de Core.

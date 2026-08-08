---
title: Vue
description: Comparte un cliente Defjs mediante la inyección de Vue, configúralo para tu API, conserva el ámbito de petición SSR y libera los transportes.
---

# `@defjs/vue`

`@defjs/vue` es un adaptador ligero de inyección para `@defjs/core`. Exporta:

- `provideClient(...)`, un plugin de Vue que crea y proporciona un cliente de Core;
- `injectClient()`, que devuelve el cliente inyectado más cercano;
- `HTTP_CLIENT`, la clave de inyección que permite proporcionar otro cliente;
- los helpers del adaptador `withEndpoint(...)` y `withInterceptors(...)`; este último acepta funciones que crean interceptores.

No añade comportamiento de transporte, caché, gestión de estado, reintentos ni un módulo de Nuxt. Instálalo junto a `@defjs/core` y Vue, y conserva esas responsabilidades en los composables, stores e integraciones de tu aplicación.

## Instalar el plugin

Cada instalación del plugin crea un cliente:

```typescript
// main.ts
import { createApp } from 'vue'
import { provideClient, withEndpoint } from '@defjs/vue'
import App from './App.vue'

const app = createApp(App)

app.use(provideClient(withEndpoint('https://api.example.com')))

app.mount('#app')
```

`provideClient(...options)` acepta cualquier `ClientOption` de `@defjs/core`, no solo las opciones que el adaptador Vue vuelve a exportar o crear:

```typescript
import { withCredentials, withSSEReconnect } from '@defjs/core'
import { provideClient, withEndpoint } from '@defjs/vue'

app.use(provideClient(withEndpoint('https://api.example.com'), withCredentials(true), withSSEReconnect({ attempts: 3 })))
```

Las opciones se ejecutan cuando se instala el plugin y se crea el cliente. Si instalas el mismo objeto plugin en otra aplicación, se crea otro cliente.

## Inyectar el cliente más cercano

Llama a `injectClient()` dentro de `setup` de un componente, de `<script setup>` o de un composable o contexto de inyección activo:

```vue
<script setup lang="ts">
import { injectClient } from '@defjs/vue'

const client = injectClient()
</script>
```

Lanza una excepción cuando no encuentra `HTTP_CLIENT`. No lo llames de forma arbitraria en el ámbito de un módulo.

Se aplica la regla habitual de Vue: gana el provider más cercano. Un componente puede proporcionar otro cliente para sus descendientes:

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

Los descendientes que llamen a `injectClient()` reciben `scopedClient`; los hermanos que estén fuera de este subárbol siguen recibiendo el cliente de la aplicación.

## Funciones de creación de interceptores

El `withInterceptors(...)` del adaptador acepta funciones de creación, no instancias de interceptor. Las evalúa al crear el cliente y añade sus resultados en el orden de las opciones.

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

Esto es distinto del `withInterceptors(...)` de Core, que acepta interceptores ya creados. En servidor, mantén las funciones que obtengan credenciales dentro del ámbito de la petición.

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

Una aplicación de navegador puede instalar un único cliente mediante el plugin si su configuración es apta para el navegador e independiente de cada petición.

En SSR, no captures cabeceras de petición, cookies ni datos de usuario o tenant en un singleton de aplicación compartido entre peticiones. Crea un cliente de Core dentro del límite de cada petición del servidor y pásalo o proporciónalo solo en el árbol que renderice esa petición.

El adaptador no aísla las closures de la aplicación entre peticiones SSR concurrentes. Tampoco decide qué cabeceras o cookies de entrada es seguro reenviar.

Un plugin de cliente de Nuxt puede instalar el adaptador Vue para código que se ejecute en el navegador:

```typescript
// plugins/defjs.client.ts
import { provideClient, withEndpoint } from '@defjs/vue'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(provideClient(withEndpoint(useRuntimeConfig().public.apiBase)))
})
```

El sufijo `.client.ts` hace que este código solo se ejecute en el navegador. No es un cliente por petición del servidor y no debe reenviar credenciales SSR. En una aplicación Nuxt, prueba este límite junto a los plugins, route handlers y la hidratación que uses realmente.

## Responsabilidad sobre los recursos

Instalar o desmontar un provider de Vue no cancela trabajo HTTP ni cierra recursos SSE o WebSocket. El adaptador crea un cliente y los clientes de Core no tienen método `dispose()`.

El componente, composable, ruta o store que inicia trabajo en tiempo real debe:

- registrar la limpieza antes o durante el arranque asíncrono;
- cancelar el arranque cuando termine su ámbito;
- cerrar un manejador o una sesión que llegue después de haberse liberado ese ámbito;
- consumir continuamente `stream` o `session.receive`;
- llamar a `stream.close(...)` o `session.close(...)` cuando el recurso esté activo;
- dar de baja los observadores WebSocket.

No abras un WebSocket solo para añadir un listener de estado y dejar sin leer su cola de entrada ilimitada. Consulta [SSE](/es-ES/core/sse) y [WebSocket](/es-ES/core/web-socket) para ver las reglas completas del ciclo de vida.

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

## Siguiente paso

- [Client](/es-ES/core/client) cubre la composición de opciones de Core y el ámbito del cliente.
- [Comandos](/es-ES/core/commands) cubre las definiciones de endpoint y la entrada de los comandos.
- [Interceptores](/es-ES/core/interceptors) cubre el contrato de interceptores de Core.

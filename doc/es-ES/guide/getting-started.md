---
title: Getting Started
description: Install @defjs/core, use it via CDN, and create your first typed request in three steps.
---

# Empezar

Defjs es una librería TypeScript para definir APIs de petición tipadas y ejecutarlas a través de múltiples transportes y runtimes JavaScript.

## Instalación

Usa tu gestor de paquetes preferido:

::: code-group

```sh [npm]
npm install @defjs/core
```

```sh [yarn]
yarn add @defjs/core
```

```sh [pnpm]
pnpm add @defjs/core
```

```sh [bun]
bun add @defjs/core
```

:::

## Uso con CDN

Importa directamente como un módulo ES sin herramienta de build:

```typescript
import { createClient, defineRequest, struct } from 'https://unpkg.com/@defjs/core/index.min.js'
```

## Tres pasos para tu primera petición

### Paso 1: Crear un Cliente

El Cliente es el punto de entrada para toda ejecución de peticiones. Crea una instancia con `createClient` y configura el endpoint base:

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

### Paso 2: Definir una petición

Usa `defineRequest` para definir un endpoint HTTP tipado. Usa `struct` para describir la forma de las entradas y respuestas:

```typescript
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user/:id',
  input: struct.object({
    id: struct.number(),
  }),
  output: {
    200: struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
    404: struct.object({
      message: struct.string(),
    }),
  },
})
```

::: tip
Las claves en `output` son códigos de estado HTTP. Defjs selecciona automáticamente el esquema coincidente en tiempo de ejecución y deriva los tipos TypeScript en consecuencia: las respuestas 2xx se tipan como datos de éxito, las no-2xx como datos de error.
:::

### Paso 3: Ejecutar

Llama a `client.execute` con tu comando de petición y configuración opcional:

```typescript
const [error, user, response] = await client.execute(getUser({ id: 1 }))

if (error) {
  // error está tipado según los esquemas no-2xx en output
  console.error(error.code, error.message)
  return
}

// user está tipado como { id: number; name: string }
console.log(user.name)
```

## Ejemplo completo

Aquí tienes un ejemplo end-to-end con validación de entrada, validación de salida, manejo de errores y un interceptor:

```typescript
import { createClient, defineRequest, struct, tag, withEndpoint, withInterceptors } from '@defjs/core'

// 1. Crear Cliente
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors([
    async (request, next) => {
      request.headers.set('Authorization', 'Bearer token')
      return next(request)
    },
  ]),
)

// 2. Definir petición
const createPost = defineRequest({
  method: 'POST',
  path: '/v1/posts',
  input: struct.object({
    title: struct.string(),
    body: struct.string(),
    'X-Request-ID': tag(struct.string(), { kind: 'header' }),
  }),
  build: (input) => ({
    body: { title: input.title, body: input.body },
    headers: { 'X-Request-ID': input['X-Request-ID'] },
  }),
  output: {
    201: struct.object({
      id: struct.number(),
      title: struct.string(),
    }),
    400: struct.object({
      field: struct.string(),
      reason: struct.string(),
    }),
  },
})

// 3. Ejecutar
async function createPost() {
  const [error, post, response] = await client.execute(
    createPost({
      title: 'Hello',
      body: 'World',
      'X-Request-ID': 'uuid-123',
    }),
  )

  if (error) {
    switch (error.code) {
      case 'HTTP_STATUS':
        console.error('Validation failed:', error.data)
        break
      case 'REQUEST_VALIDATION_FAILED':
        console.error('Request validation failed:', error.message)
        break
      case 'RESPONSE_VALIDATION_FAILED':
        console.error('Response validation failed:', error.message)
        break
      case 'TRANSPORT_ERROR':
        console.error('Network error:', error.message)
        break
      default:
        console.error('Unknown error:', error)
    }
    return
  }

  console.log('Created post:', post.id, post.title)
}
```

## Referencia rápida de la API Core

| API                    | Descripción                         | Uso típico                                                                     |
| ---------------------- | ----------------------------------- | ------------------------------------------------------------------------------ |
| `createClient`         | Crear un cliente de peticiones      | `createClient(withEndpoint('https://api.example.com'))`                        |
| `defineRequest`        | Definir un endpoint HTTP            | `defineRequest({ method: 'GET', path: '/user', output: { 200: UserSchema } })` |
| `defineEventStream`    | Definir un endpoint SSE             | `defineEventStream({ path: '/events', events: { message: struct.string() } })` |
| `defineWebSocket`      | Definir un endpoint WebSocket       | `defineWebSocket({ path: '/ws', incoming, outgoing })`                         |
| `struct`               | Constructor de esquemas             | `struct.object({ id: struct.number() })`                                       |
| `tag`                  | Etiqueta de metadatos para campos   | `tag(struct.string(), { kind: 'header' })`                                     |
| `withEndpoint`         | Establecer URL base                 | `withEndpoint('https://api.example.com')`                                      |
| `withInterceptors`     | Registrar interceptores             | `withInterceptors([...interceptors])`                                          |
| `withCredentials`      | Habilitar credenciales cross-origin | `withCredentials(true)`                                                        |
| `withSSEOptions`       | Configurar opciones SSE             | `withSSEOptions({ method: 'POST' })`                                           |
| `withWebSocketOptions` | Configurar opciones WebSocket       | `withWebSocketOptions({ protocols: ['v1'] })`                                  |

## Qué sigue

- [Cliente →](/core/client) — Crear clientes, ejecutar comandos y configuración
- [Comandos →](/core/commands) — `defineRequest`, `defineEventStream`, `defineWebSocket`
- [Errores →](/core/errors) — Estructura de `RequestError` y patrones de ramificación

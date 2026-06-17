---
title: Decisiones de Diseño
description: Decisiones de diseño de API que pueden diferir de los patrones comunes en otras bibliotecas HTTP.
---

# Decisiones de Diseño

Defjs se desvía intencionalmente de algunos patrones comunes encontrados en otras bibliotecas HTTP. Este documento explica el razonamiento de diseño detrás de cada decisión.

## Diseño de cliente explícito

Defjs requiere que cada cliente se cree explícitamente. Creas un `Client` con `createClient` y lo pasas donde se necesite.

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const [error, data] = await client.execute(getUser())
```

Por qué este diseño:

- **Amigable con tests**: Pasa diferentes instancias de `Client` directamente a los tests sin necesidad de reiniciar o simular ningún estado.
- **Coexistencia multi-entorno**: Múltiples clientes pueden ejecutarse en paralelo en el mismo proceso (p. ej., API interna + API pública) sin interferencia.
- **Transparencia de dependencias**: Los llamadores deben tener explícitamente un `Client`, haciendo las dependencias visibles para análisis estático y revisión de código.

Si necesitas un cliente compartido en tu aplicación, expórtalo desde un módulo:

```typescript
// api/client.ts
import { createClient, withEndpoint } from '@defjs/core'

export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

## Integración con Frameworks

`@defjs/angular`, `@defjs/vue` y `@defjs/react` integran clientes explícitos con el modelo de dependencias de cada framework. Angular y Vue usan `provideClient` / `injectClient`; React usa `ClientProvider` / `useClient`. Esto permite registrar y recuperar clientes dentro del árbol de componentes o servicios.

### Angular

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/angular'

export const appConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}

export class UserComponent {
  private client = injectClient()

  async loadUser() {
    const [error, user] = await this.client.execute(this.getUser())
  }
}
```

### Vue

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/vue'

app.use(provideClient(withEndpoint('https://api.example.com')))

const client = injectClient()
const [error, user] = await client.execute(getUser())
```

### React

```tsx
import { ClientProvider, useClient, withEndpoint } from '@defjs/react'

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com')]}>
      <UserProfile />
    </ClientProvider>
  )
}

function UserProfile() {
  const client = useClient()
  // usa client.execute(...) dentro de la lógica del componente
}
```

## Opciones a nivel de petición en `execute`, no en el builder

Las opciones a nivel de petición (`abort`, `timeout`, `heartbeat`, `reconnect`, etc.) se pasan mediante el segundo argumento de `client.execute`, no el constructor de comando.

```typescript
// Correcto: las opciones a nivel de petición van a execute
const [error, user] = await client.execute(getUser(), { timeout: 5000 })
```

## `execute` sobrecargado por tipo de comando

`client.execute` está sobrecargado para devolver automáticamente el tipo de resultado correcto según el tipo de `Command`.

```typescript
// Petición HTTP — devuelve HttpAwaitResult
const [error, user, response] = await client.execute(httpCommand())

// Flujo SSE — devuelve StreamAwaitResult
const [error, stream, open] = await client.execute(sseCommand())

// WebSocket — devuelve SocketAwaitResult
const [error, socket, connection] = await client.execute(wsCommand())
```

## `onInvalidEvent` es un observador

`onInvalidEvent` de SSE es un observador. Las excepciones lanzadas dentro de él se ignoran silenciosamente y no interrumpen el flujo.

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
      // Incluso si esto lanza, el flujo continúa
    },
  },
})
```

## Consolidación del submódulo de errores

Todos los símbolos de error se exportan desde la entrada principal `@defjs/core`.

| Export                  | Descripción                       | Uso típico                                                  |
| ----------------------- | --------------------------------- | ----------------------------------------------------------- |
| `RequestError`          | Tipo unión de error               | Ramificación con `switch (error.kind)`                      |
| `ERR_ABORTED`           | Identificador de aborto           | `controller.abort(ERR_ABORTED)`                             |
| `ERR_TIMEOUT`           | Identificador de tiempo de espera | `createTransportError(ERR_TIMEOUT)`                         |
| `createTransportError`  | Crear error de transporte         | `createTransportError(new Error('offline'))`                |
| `createDefinitionError` | Crear error de definición         | `createDefinitionError('REQUEST_VALIDATION_FAILED', cause)` |
| `createHttpStatusError` | Crear error de estado HTTP        | `createHttpStatusError(404, 'Not Found', response, data)`   |

Importar desde la entrada principal:

```typescript
import { RequestError, ERR_ABORTED, ERR_TIMEOUT, createTransportError, createDefinitionError, createHttpStatusError } from '@defjs/core'
```

## Ramificación de errores por `kind` y `code`

Defjs recomienda ramificar por `kind` y `code` en lugar de comparaciones de strings.

```typescript
const [error, user] = await client.execute(getUser())

if (error) {
  switch (error.kind) {
    case 'http': {
      console.error('HTTP', error.status, error.message)
      if (error.status === 404) {
        console.error('Not found:', error.data.code)
      }
      break
    }
    case 'transport': {
      switch (error.code) {
        case 'ABORTED':
          console.error('Request aborted')
          break
        case 'TIMEOUT':
          console.error('Request timed out')
          break
        case 'NETWORK_ERROR':
          console.error('Network error:', error.cause)
          break
      }
      break
    }
    case 'definition': {
      switch (error.code) {
        case 'REQUEST_VALIDATION_FAILED':
          console.error('Request validation failed:', error.cause)
          break
        case 'RESPONSE_VALIDATION_FAILED':
          console.error('Response validation failed:', error.cause)
          break
        case 'UNDECLARED_STATUS':
          console.error('Undeclared status:', error.response?.status)
          break
      }
      break
    }
  }
}
```

## Reglas de definición de endpoint más estrictas

Defjs impone una regla estricta: **cuando se proporciona `build`, `input` también debe proporcionarse.**

```typescript
// Correcto: tiene input y build
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.object({
    path: struct.object({ id: struct.number() }),
  }),
  build(request, input) {
    request.setPathParams({ id: input.path.id })
  },
  output: { 200: struct.object({ id: struct.number(), name: struct.string() }) },
})

// Correcto: sin input ni build
const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
  output: { 200: struct.object({ items: struct.array(struct.object({ id: struct.number() })) }) },
})

// Error: tiene build pero no input
const badRequest = defineRequest({
  method: 'GET',
  path: '/users/:id',
  build(request, input) {
    request.setPathParams({ id: input.id }) // TypeScript error: falta esquema de input
  },
  output: { 200: struct.object({ id: struct.number() }) },
})
```

Esta regla también aplica a `defineEventStream` y `defineWebSocket`.

## Dependencias

| Paquete          | Versión requerida |
| ---------------- | ----------------- |
| `@defjs/core`    | `^0.4.0`          |
| `@defjs/angular` | `19.x`            |
| `@defjs/vue`     | `^0.4.0`          |
| `@defjs/react`   | `^0.4.0`          |

Rango de peer dependency de Angular: `>=18.0.0 <=22.0.0`. Rango de peer dependency de React: `>=18.0.0`. Node runtime: `>=26`.

## Qué sigue

- [Cliente →](/core/client) — Diseño de cliente explícito y configuración
- [Comandos →](/core/commands) — Definiciones de comandos y reglas de entrada
- [Errores →](/core/errors) — Estructura de `RequestError` y ramificación

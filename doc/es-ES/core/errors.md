---
title: Errors
description: RequestError structure, error classification, built-in constants, and recommended branching patterns.
---

# Errores

Todos los resultados de ejecución en `@defjs/core` se devuelven como tríplas `[error, result, response]`. `error` es un `RequestError`: una unión discriminada con `kind` y `code`. Ramificar por `kind` y `code` es el patrón recomendado en lugar de comparaciones de strings.

## Estructura de RequestError

`RequestError` es una unión de tres tipos de error:

```typescript
import type { RequestError } from '@defjs/core'

type RequestError<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

Todos los errores comparten estos campos comunes:

| Campo      | Tipo                                    | Descripción                                                         |
| ---------- | --------------------------------------- | ------------------------------------------------------------------- |
| `kind`     | `'http' \| 'transport' \| 'definition'` | Categoría de error para ramificación de primer nivel                |
| `code`     | `string`                                | Código de error preciso para ramificación de segundo nivel          |
| `message`  | `string`                                | Descripción de error legible por humanos                            |
| `data`     | `unknown`                               | Datos adicionales (solo para errores `http` y `definition`)         |
| `response` | `SettledResponseLike`                   | Objeto de respuesta crudo (solo para errores `http` y `definition`) |

### HttpStatusError

Producido cuando el servidor devuelve un código de estado no-2xx que está definido en `output`.

```typescript
interface HttpStatusError<TErrorData = unknown> {
  kind: 'http'
  code: 'HTTP_STATUS'
  status: number
  message: string
  data: TErrorData
  response: SettledResponseLike<unknown>
}
```

El tipo `data` se deriva del esquema `output` para el código de estado coincidente. Por ejemplo, `output: { 404: notFoundStruct }` estrecha `error.data` al tipo inferido de `notFoundStruct`.

### TransportError

Producido en fallos de red o capa de transporte, incluyendo aborto, tiempo de espera y errores de red genéricos.

```typescript
interface TransportError {
  kind: 'transport'
  code: 'ABORTED' | 'TIMEOUT' | 'NETWORK_ERROR'
  message: string
  cause?: unknown
}
```

### DefinitionError

Producido en fallos de definición de petición o validación.

```typescript
interface DefinitionError {
  kind: 'definition'
  code: 'REQUEST_VALIDATION_FAILED' | 'RESPONSE_VALIDATION_FAILED' | 'UNDECLARED_STATUS'
  message: string
  cause?: unknown
  response?: SettledResponseLike<unknown>
}
```

| Código                       | Escenario de activación                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `REQUEST_VALIDATION_FAILED`  | Parámetros de entrada fallaron validación del struct `input`, o `build` lanzó una excepción |
| `RESPONSE_VALIDATION_FAILED` | Cuerpo de respuesta falló validación del struct `output` para el código de estado devuelto  |
| `UNDECLARED_STATUS`          | El servidor devolvió un código de estado 2xx no declarado en `output`                       |

## Clasificación y ramificación de errores

**No** uses comparación de strings para juzgar tipos de error:

```typescript
// No recomendado: frágil y sin estrechamiento de tipo
if (error.message.includes('timeout')) { ... }
```

**Recomendado**: Ramifica por `kind` y `code` para estrechamiento de tipo preciso:

```typescript
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient(/* ... */)

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ code: struct.string(), message: struct.string() }),
  },
})

const [error, user] = await client.execute(getUser())

if (error) {
  switch (error.kind) {
    case 'http': {
      // error se estrecha a HttpStatusError
      console.error('HTTP', error.status, error.message)
      if (error.status === 404) {
        // error.data se estrecha a { code: string; message: string }
        console.error('Not found:', error.data.code)
      }
      break
    }
    case 'transport': {
      // error se estrecha a TransportError
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
      // error se estrecha a DefinitionError
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

## Constantes integradas

`@defjs/core` exporta dos constantes para identificar errores de transporte específicos:

```typescript
import { ERR_ABORTED, ERR_TIMEOUT } from '@defjs/core'

// ERR_ABORTED: La petición fue cancelada activamente
// ERR_TIMEOUT: La petición excedió el tiempo de espera
```

### Activar cancelación en interceptores

```typescript
import { createHttpInterceptor, ERR_ABORTED } from '@defjs/core'

const authInterceptor = createHttpInterceptor(async (req, next) => {
  const token = await getToken()
  if (!token) {
    throw ERR_ABORTED
  }
  req.setHeader('Authorization', `Bearer ${token}`)
  return next(req)
})
```

### Uso con AbortController

```typescript
import { ERR_ABORTED } from '@defjs/core'

const controller = new AbortController()
controller.abort(ERR_ABORTED)

const [error] = await client.execute(getUser(), { signal: controller.signal })
// error.code === 'ABORTED'
```

### Crear errores de transporte manualmente

```typescript
import { createTransportError, ERR_TIMEOUT } from '@defjs/core'

const error = createTransportError(ERR_TIMEOUT)
// { kind: 'transport', code: 'TIMEOUT', message: 'Request timed out' }
```

## Funciones auxiliares

### `createTransportError`

Normaliza una excepción cruda en un `TransportError`.

```typescript
import { createTransportError, ERR_ABORTED, ERR_TIMEOUT } from '@defjs/core'

createTransportError(ERR_ABORTED)
// => { kind: 'transport', code: 'ABORTED', message: 'Request was aborted' }

createTransportError(ERR_TIMEOUT)
// => { kind: 'transport', code: 'TIMEOUT', message: 'Request timed out' }

createTransportError(new Error('offline'))
// => { kind: 'transport', code: 'NETWORK_ERROR', message: 'offline' }
```

### `createDefinitionError`

Normaliza una excepción cruda en un `DefinitionError`.

```typescript
import { createDefinitionError } from '@defjs/core'

createDefinitionError('REQUEST_VALIDATION_FAILED', new Error('invalid id'))
// => { kind: 'definition', code: 'REQUEST_VALIDATION_FAILED', message: 'invalid id' }
```

### `createHttpStatusError`

Normaliza una respuesta no-2xx en un `HttpStatusError`.

```typescript
import { createHttpStatusError } from '@defjs/core'

const response = {
  body: { code: 'NOT_FOUND' },
  headers: new Headers(),
  ok: false,
  status: 404,
  statusText: 'Not Found',
  url: 'https://api.example.com/v1/user',
}

createHttpStatusError(404, 'Not Found', response, { code: 'NOT_FOUND' })
// => { kind: 'http', code: 'HTTP_STATUS', status: 404, message: 'Not Found', data: { code: 'NOT_FOUND' }, response }
```

## Qué sigue

- [Cliente →](/core/client) — Crear clientes y ejecutar comandos
- [Peticiones HTTP →](/core/http) — `defineRequest` y patrones de output
- [SSE →](/core/sse) — Errores SSE y estrategias de reconexión
- [WebSocket →](/core/web-socket) — Manejo de errores de conexión WebSocket

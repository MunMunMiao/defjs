---
title: Interceptors
description: Per-transport HTTP, SSE, and WebSocket interceptors, onion-chain execution model, and common interceptor examples.
---

# Interceptores

Los interceptores de `@defjs/core` se dividen por capa de transporte: HTTP, SSE y WebSocket. Comparten el mismo modelo de ejecución de cadena de cebolla pero manejan diferentes formas de petición/respuesta: HTTP devuelve `Promise<HttpResponse>`, SSE devuelve `Promise<EventStreamHandle>` y WebSocket devuelve `Promise<WebSocketSessionLike>`.

Los interceptores se registran a nivel de `Cliente` mediante `withInterceptors(...)`. El cliente filtra y despacha automáticamente a la cadena de interceptores correcta según el tipo de comando.

## Tres tipos de interceptor

### Interceptores HTTP

Los interceptores HTTP operan sobre `HttpRequest` y devuelven `Promise<HttpResponse>`. Uso típico: inyectar cabeceras de autenticación, registro, reintento, transformación de errores.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpResponse, HttpInterceptorNext } from '@defjs/core'

const loggingInterceptor = createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
  console.log(`[HTTP] ${req.method} ${req.endpoint}`)
  const response = await next(req)
  console.log(`[HTTP] ${req.method} ${req.endpoint} -> ${response.status}`)
  return response
})
```

### Interceptores SSE

Los interceptores SSE operan sobre `HttpRequest` (la petición HTTP antes de la conexión) y devuelven `Promise<EventStreamHandle>`. Uso típico: inyectar cabeceras de autenticación antes de la conexión SSE, monitorizar estado de conexión.

```typescript
import { createSSEInterceptor } from '@defjs/core'
import type { HttpRequest, SSEHandler } from '@defjs/core'

const sseAuthInterceptor = createSSEInterceptor(async (req: HttpRequest, next: SSEHandler) => {
  const headers = new Headers(req.headers)
  headers.set('Authorization', `Bearer ${getToken()}`)
  const stream = await next({ ...req, headers })
  return stream
})
```

### Interceptores WebSocket

Los interceptores WebSocket operan sobre `HttpRequest` (la petición HTTP antes del handshake) y devuelven `Promise<WebSocketSessionLike>`. Uso típico: modificar URL o inyectar cabeceras de subprotocolo antes del handshake WebSocket.

```typescript
import { createWebSocketInterceptor } from '@defjs/core'
import type { HttpRequest, WebSocketHandler } from '@defjs/core'

const wsProtocolInterceptor = createWebSocketInterceptor(async (req: HttpRequest, next: WebSocketHandler) => {
  const headers = new Headers(req.headers)
  headers.set('Sec-WebSocket-Protocol', 'v1')
  const session = await next({ ...req, headers })
  return session
})
```

## Modelo de ejecución de cadena de cebolla

Los tres tipos de cadena de interceptores usan el **modelo de cebolla**: la fase de petición entra en orden de registro, la fase de respuesta regresa en orden inverso.

```typescript
import { createHttpInterceptor, makeInterceptorChain } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext, HttpResponse } from '@defjs/core'

const order: number[] = []

const a = createHttpInterceptor(async (req, next) => {
  order.push(1) // Fase petición: primero en entrar
  const res = await next(req)
  order.push(1.1) // Fase respuesta: último en salir
  return res
})

const b = createHttpInterceptor(async (req, next) => {
  order.push(2)
  const res = await next(req)
  order.push(2.1)
  return res
})

const c = createHttpInterceptor(async (req, next) => {
  order.push(3) // Fase petición: último en entrar
  const res = await next(req)
  order.push(3.1) // Fase respuesta: primero en salir
  return res
})

// Orden de registro: a -> b -> c
// Orden de ejecución: 1 -> 2 -> 3 -> 3.1 -> 2.1 -> 1.1
```

### Modificar peticiones y respuestas

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext } from '@defjs/core'

const addHeaderInterceptor = createHttpInterceptor(async (req, next) => {
  const headers = new Headers(req.headers)
  headers.set('X-Request-Id', crypto.randomUUID())
  return next({ ...req, headers })
})

const wrapErrorInterceptor = createHttpInterceptor(async (req, next) => {
  try {
    return await next(req)
  } catch (error) {
    throw new Error(`Request failed: ${error}`)
  }
})
```

### Envolver resultados de retorno

```typescript
import { createWebSocketInterceptor } from '@defjs/core'
import type { WebSocketInterceptorFn } from '@defjs/core'

const wrapSessionInterceptor: WebSocketInterceptorFn = async (req, next) => {
  const session = await next(req)
  return {
    ...session,
    send(message: unknown) {
      console.log('[WS] send:', message)
      session.send(message)
    },
  }
}
```

## Ejemplos comunes de interceptores

### Interceptor de autenticación

Inyecta Bearer Token en cabeceras. HTTP y SSE comparten la misma lógica.

```typescript
import { createHttpInterceptor, createSSEInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext } from '@defjs/core'

function getToken(): string {
  return localStorage.getItem('token') ?? ''
}

const authHttpInterceptor = createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
  const headers = new Headers(req.headers)
  headers.set('Authorization', `Bearer ${getToken()}`)
  return next({ ...req, headers })
})

const authSSEInterceptor = createSSEInterceptor(async (req, next) => {
  const headers = new Headers(req.headers)
  headers.set('Authorization', `Bearer ${getToken()}`)
  return next({ ...req, headers })
})
```

### Interceptor de registro

Registra duración de petición y código de estado.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext } from '@defjs/core'

const timingInterceptor = createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
  const start = performance.now()
  const response = await next(req)
  const duration = (performance.now() - start).toFixed(2)
  console.log(`[${duration}ms] ${req.method} ${req.endpoint} ${response.status}`)
  return response
})
```

### Interceptor de reintento

Reintenta códigos de estado específicos. El interceptor de reintento debe registrarse cerca del final de la cadena, después de registro pero antes de la petición real.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext, HttpResponse } from '@defjs/core'

function retryInterceptor(maxRetries = 3, delayMs = 1000) {
  return createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
    let lastError: unknown

    for (let i = 0; i <= maxRetries; i++) {
      try {
        const response = await next(req)
        if (response.status >= 500) {
          lastError = new Error(`Server error: ${response.status}`)
          if (i < maxRetries) {
            await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
            continue
          }
        }
        return response
      } catch (error) {
        lastError = error
        if (i < maxRetries) {
          await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
          continue
        }
      }
    }

    throw lastError
  })
}
```

### Interceptor Basic Auth (integrado)

`@defjs/core` proporciona interceptores Basic Auth integrados para HTTP y SSE.

```typescript
import { basicAuthHttpInterceptor, basicAuthSSEInterceptor } from '@defjs/core'

const credential = () => ({ username: 'admin', password: 'secret' })

const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(basicAuthHttpInterceptor(credential), basicAuthSSEInterceptor(credential)),
)
```

La codificación por defecto usa `globalThis.btoa`. Para entornos sin `btoa` (p. ej., Node), personaliza mediante `options.encode`:

```typescript
import { basicAuthHttpInterceptor } from '@defjs/core'

const interceptor = basicAuthHttpInterceptor(() => ({ username: 'user', password: 'pass' }), {
  encode: (cred) => Buffer.from(`${cred.username}:${cred.password}`).toString('base64'),
})
```

## Registro y filtrado

### Registro mediante `withInterceptors`

Los interceptores se registran en `createClient` mediante `withInterceptors(...)`. La misma matriz puede mezclar los tres tipos de interceptor; el cliente filtra automáticamente por tipo de comando.

```typescript
import { createClient, withEndpoint, withInterceptors } from '@defjs/core'
import { createHttpInterceptor, createSSEInterceptor, createWebSocketInterceptor } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(
    createHttpInterceptor(async (req, next) => {
      console.log('HTTP:', req.endpoint)
      return next(req)
    }),
    createSSEInterceptor(async (req, next) => {
      console.log('SSE:', req.endpoint)
      return next(req)
    }),
    createWebSocketInterceptor(async (req, next) => {
      console.log('WS:', req.endpoint)
      return next(req)
    }),
  ),
)
```

### Reglas de filtrado

El cliente filtra interceptores por tipo de comando:

| Tipo de comando               | Condición de filtro     | Función interna                |
| ----------------------------- | ----------------------- | ------------------------------ |
| HTTP (`defineRequest`)        | `kind === 'http'`       | `resolveHttpInterceptors`      |
| SSE (`defineEventStream`)     | `kind === 'sse'`        | `resolveSSEInterceptors`       |
| WebSocket (`defineWebSocket`) | `kind === 'web-socket'` | `resolveWebSocketInterceptors` |

Los interceptores filtrados mantienen su orden de registro original, luego forman una cadena de cebolla.

```typescript
// Lógica interna de ejecución simplificada
const httpInterceptors = resolveHttpInterceptors(clientConfig.interceptors)
const chain = makeInterceptorChain(httpInterceptors)
const response = await chain(request, (req) => fetchHandler(req, clientConfig.http.fetch))
```

### Orden y composición de interceptores

Múltiples llamadas `withInterceptors` añaden interceptores en orden.

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(loggingInterceptor), // Primero
  withInterceptors(authInterceptor, retryInterceptor), // Segundo
)
// Orden final: logging -> auth -> retry
```

## Notas sobre metadatos de cuerpo

Cuando un interceptor reemplaza `body`, los metadatos antiguos de `bodyContentType` se invalidan automáticamente para prevenir que un `Content-Type` incorrecto se envíe al servidor.

```typescript
// Mantener cuerpo original: el metadato Content-Type permanece válido
const keepBody = createHttpInterceptor((req, next) => next({ ...req, headers: new Headers(req.headers) }))

// Reemplazar cuerpo: el Content-Type antiguo se limpia, el nuevo tipo de cuerpo lo determina
const replaceBody = createHttpInterceptor((req, next) => next({ ...req, body: new FormData() }))
```

## Referencia de API

### Funciones de creación

| Función                          | Descripción                    |
| -------------------------------- | ------------------------------ |
| `createHttpInterceptor(fn)`      | Crear un interceptor HTTP      |
| `createSSEInterceptor(fn)`       | Crear un interceptor SSE       |
| `createWebSocketInterceptor(fn)` | Crear un interceptor WebSocket |

### Tipos

| Tipo                   | Descripción                                                                       |
| ---------------------- | --------------------------------------------------------------------------------- |
| `HttpInterceptor`      | Objeto interceptor HTTP `{ kind: 'http', fn: InterceptorFn }`                     |
| `SSEInterceptor`       | Objeto interceptor SSE `{ kind: 'sse', fn: SSEInterceptorFn }`                    |
| `WebSocketInterceptor` | Objeto interceptor WebSocket `{ kind: 'web-socket', fn: WebSocketInterceptorFn }` |
| `Interceptor`          | Unión de los tres tipos de interceptor                                            |
| `HttpInterceptorNext`  | Handler next HTTP `(req: HttpRequest) => Promise<HttpResponse>`                   |
| `SSEHandler`           | Handler next SSE `(req: HttpRequest) => Promise<EventStreamHandle>`               |
| `WebSocketHandler`     | Handler next WebSocket `(req: HttpRequest) => Promise<WebSocketSessionLike>`      |

### Interceptores integrados

| Función                                          | Descripción                 |
| ------------------------------------------------ | --------------------------- |
| `basicAuthHttpInterceptor(credential, options?)` | Interceptor HTTP Basic Auth |
| `basicAuthSSEInterceptor(credential, options?)`  | Interceptor SSE Basic Auth  |

## Qué sigue

- [Cliente →](/core/client) — Crear clientes y configurar interceptores
- [Peticiones HTTP →](/core/http) — `defineRequest` y patrones de output
- [SSE →](/core/sse) — Definición SSE y streaming
- [WebSocket →](/core/web-socket) — Definición WebSocket y ciclo de vida

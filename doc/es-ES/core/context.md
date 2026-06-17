---
title: Context
description: HttpContext passing, request builder capabilities, input parsing, and transport-specific configuration.
---

# Contexto

Flujo de ejecución de Defjs: la configuración del Cliente proporciona valores globales por defecto; las definiciones de comandos describen la estructura del endpoint; `build` mapea la entrada parseada a partes de la petición HTTP; y `HttpContext` actúa como equipaje invisible pasado entre interceptores durante un ciclo de vida de ejecución único.

## Paso de HttpContext

`HttpContext` es un contenedor de clave-valor basado en Token para metadatos dentro de un ciclo de vida de petición/conexión único. No participa en la serialización de URL, cabecera o cuerpo. Es leído y escrito por interceptores.

### Crear y usar

```typescript
import { makeHttpContext, makeHttpContextToken } from '@defjs/core'

// 1. Definir un Token (con valor por defecto)
const requestIdToken = makeHttpContextToken(() => 'unknown')
const authToken = makeHttpContextToken(() => ({ role: 'guest' }))

// 2. Crear contexto y establecer valores
const ctx = makeHttpContext().set(requestIdToken, 'req-42').set(authToken, { role: 'admin' })

// 3. Pasar en tiempo de ejecución
const [error, data] = await client.execute(getUser(), { context: ctx })
```

### Leer en interceptores

```typescript
import { createHttpInterceptor } from '@defjs/core'

const loggingInterceptor = createHttpInterceptor(async (req, next) => {
  const requestId = req.context?.get(requestIdToken) ?? 'unknown'
  console.log(`[${requestId}] → ${req.method} ${req.endpoint}`)
  return next(req)
})
```

### Fusionar contextos

```typescript
import { mergeHttpContexts } from '@defjs/core'

const baseCtx = makeHttpContext().set(requestIdToken, 'req-42')
const extraCtx = makeHttpContext().set(authToken, { role: 'admin' })

const merged = mergeHttpContexts(baseCtx, extraCtx)
// merged contiene tanto requestId como auth
```

### API clave

| Export                                           | Descripción                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| `makeHttpContextToken<T>(defaultValue: () => T)` | Crear un Token con valor por defecto                                       |
| `makeHttpContext()`                              | Crear contexto vacío                                                       |
| `makeHttpContext(entries)`                       | Crear desde matriz `[token, value]`                                        |
| `makeHttpContext(otherContext)`                  | Copiar otro contexto                                                       |
| `mergeHttpContexts(primary, secondary)`          | Fusionar dos contextos; secondary anula primary para el mismo Token        |
| `ctx.set(token, value)`                          | Escribir valor; devuelve self (encadenable)                                |
| `ctx.get(token)`                                 | Leer valor; devuelve el valor por defecto del Token si no está establecido |
| `ctx.has(token) / ctx.del(token)`                | Comprobar / eliminar                                                       |
| `ctx.keys() / ctx.length`                        | Iterar / contar                                                            |

---

## Request Builder y parseo de entrada

### Flujo de parseo de entrada

Al ejecutar un comando, el Cliente procesa la entrada en este orden:

1. **Validar**: Valida y parsea los datos crudos del llamador usando el `input` Struct.
2. **Build**: Llama `build(request, parsedInput)` para mapear los datos parseados a partes de la petición.
3. **Transporte**: Despacha a HTTP fetch, flujo SSE o conexión WebSocket según `kind`.

```typescript
import { defineRequest, struct } from '@defjs/core'

const CreateUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.object({
    body: struct.object({
      name: struct.string(),
      email: struct.string(),
    }),
  }),
  build(request, input) {
    request.setJson(input.body)
  },
  output: {
    201: struct.object({ id: struct.number() }),
  },
})

const [error, user] = await client.execute(CreateUser({ body: { name: 'Alice', email: 'alice@example.com' } }))
```

### Matriz de capacidades del handler Build

Diferentes transportes admiten diferentes operaciones `build`:

| Método Build                              | HTTP | SSE | WebSocket |
| ----------------------------------------- | ---- | --- | --------- |
| `setPathParams` / `setQueryParams`        | ✓    | ✓   | ✓         |
| `setHeaders` / `addHeaders`               | ✓    | ✓   | ✗         |
| `setJson` / `setText` / `setHtml`         | ✓    | ✗   | ✗         |
| `setFormData` / `addFormData`             | ✓    | ✗   | ✗         |
| `setFormUrlEncoded` / `addFormUrlEncoded` | ✓    | ✗   | ✗         |
| `setBlob` / `setArrayBuffer`              | ✓    | ✗   | ✗         |
| `withCredentials`                         | ✓    | ✗   | ✗         |

Usar un método no soportado por el transporte en `build` lanza `REQUEST_VALIDATION_FAILED` en tiempo de ejecución.

### Build automático

Si omites `build`, también debes omitir `input`. Sin embargo, puedes usar la forma `request` de Struct para dejar que el framework infiera automáticamente la lógica de build:

```typescript
import { defineRequest, struct } from '@defjs/core'

const GetUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
    query: struct.object({ include: struct.optional(struct.string()) }),
  }),
  // No se necesita build; el framework mapea automáticamente path/query
})
```

Cuando se proporciona `build`, `input` también debe proporcionarse. Esta es una regla estricta de diseño.

---

## Configuración del Cliente

Crea un cliente con `createClient` y una o más funciones de configuración. Las funciones posteriores anulan a las anteriores para la misma clave.

```typescript
import { createClient, withEndpoint, withCredentials, withQueryParamsSerializer, withXSRF } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withCredentials(true),
  withXSRF({ cookieName: 'CSRF-TOKEN', headerName: 'X-CSRF-Token' }),
  withQueryParamsSerializer((params, raw) => {
    return params.toString()
  }),
)
```

### Opciones core

#### `withEndpoint(url)`

Establece la dirección base de la API. Todos los valores de `path` de petición se añaden después de esta URL.

```typescript
withEndpoint('https://api.example.com/v1')
// Peticionar /users produce https://api.example.com/v1/users
```

#### `withCredentials(boolean)`

Si incluir credenciales cross-origin (cookies, cabeceras de autenticación HTTP, certificados de cliente TLS). Corresponde a la opción `credentials` de `fetch`.

```typescript
withCredentials(true) // Incluir cookies en peticiones cross-origin
withCredentials(false) // Por defecto
```

#### `withXSRF(options)`

Configura el comportamiento de lectura e inyección de token XSRF. Por defecto lee `XSRF-TOKEN` de `document.cookie` y lo inyecta en la cabecera `X-XSRF-TOKEN`.

```typescript
withXSRF({
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
  tokenProvider: ({ request }) => {
    // Lógica de lectura personalizada, p. ej., desde localStorage
    return localStorage.getItem('xsrf-token')
  },
})
```

| Campo           | Tipo                                   | Por defecto              |
| --------------- | -------------------------------------- | ------------------------ |
| `cookieName`    | `string`                               | `'XSRF-TOKEN'`           |
| `headerName`    | `string`                               | `'X-XSRF-TOKEN'`         |
| `tokenProvider` | `(ctx) => string \| null \| undefined` | Lee de `document.cookie` |

#### `withQueryParamsSerializer(fn)`

Serialización personalizada de parámetros de consulta. Por defecto `URLSearchParams.toString()`.

```typescript
withQueryParamsSerializer((params, raw) => {
  return qs.stringify(raw ?? Object.fromEntries(params))
})
```

Cuando se proporciona un serializador personalizado, las peticiones HTTP y SSE permiten parámetros de consulta complejos.

---

## Configuración específica por transporte

### Opciones SSE

Configura mediante `withSSEOptions` o funciones de configuración individuales.

```typescript
import { withSSEOptions, withSSEHandle, withSSEReconnect, withSSEQueue, withSSEOnInvalidEvent } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEHandle(customFetch),
  withSSEOptions({
    reconnect: {
      attempts: 5,
      delayMs: 1000,
      factor: 2,
      jitter: 0.5,
      maxDelayMs: 30000,
      shouldReconnect: ({ attempt, cause, lastEventId, open }) => {
        return attempt < 3
      },
    },
    queue: {
      maxSize: 100,
      overflow: 'drop-oldest',
    },
    onInvalidEvent: ({ reason, message, cause }) => {
      console.warn('Invalid SSE event:', reason, message.event)
    },
    maxBufferSize: 1024 * 1024,
  }),
)
```

| Opción               | Descripción                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `sse.fetch`          | Implementación `fetch` específica para SSE                                                                                |
| `sse.reconnect`      | Estrategia de reconexión: intentos, retardo, factor de backoff, jitter, retardo máximo, función de decisión personalizada |
| `sse.queue`          | Cola de eventos: capacidad máxima, estrategia de desbordamiento                                                           |
| `sse.onInvalidEvent` | Observador de eventos inválidos (esquema faltante o fallo de validación)                                                  |
| `sse.maxBufferSize`  | Límite de tamaño del buffer subyacente (bytes)                                                                            |

### Opciones WebSocket

Configura mediante `withWebSocketOptions` o funciones de configuración individuales.

```typescript
import {
  withWebSocketOptions,
  withWebSocketHandle,
  withWebSocketHeartbeat,
  withWebSocketReconnect,
  withWebSocketQueue,
  withWebSocketBeforeConnect,
  withWebSocketProtocols,
} from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withWebSocketHandle(WebSocket),
  withWebSocketProtocols(['json', 'v1']),
  withWebSocketBeforeConnect(async () => {
    await refreshToken()
  }),
  withWebSocketHeartbeat({
    intervalMs: 30000,
    timeoutMs: 10000,
    message: () => ({ type: 'ping' }),
    isAck: (msg) => msg.type === 'pong',
  }),
  withWebSocketReconnect({
    attempts: 10,
    delayMs: 1000,
    factor: 2,
    jitter: 0.3,
    maxDelayMs: 30000,
    shouldReconnect: ({ attempt, cause, code, reason, wasClean }) => {
      return !wasClean && attempt < 5
    },
  }),
  withWebSocketQueue({
    maxSize: 50,
    overflow: 'drop-newest',
  }),
)
```

| Opción                    | Descripción                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `webSocket.WebSocket`     | Constructor `WebSocket` personalizado                                                                                     |
| `webSocket.protocols`     | Matriz de subprotocolos RFC 6455                                                                                          |
| `webSocket.beforeConnect` | Hook pre-conexión (p. ej., obtener token dinámico)                                                                        |
| `webSocket.heartbeat`     | Latido: intervalo, tiempo de espera, fábrica de mensaje, predicado ACK                                                    |
| `webSocket.reconnect`     | Estrategia de reconexión: intentos, retardo, factor de backoff, jitter, retardo máximo, función de decisión personalizada |
| `webSocket.queue`         | Cola de envío: capacidad máxima, estrategia de desbordamiento                                                             |

### Detalles del latido

El latido de WebSocket detecta la vitalidad de la conexión. Si está configurado, el framework envía mensajes de latido a `intervalMs` y espera ACK dentro de `timeoutMs`. Si el ACK expira, se activa la reconexión.

```typescript
withWebSocketHeartbeat({
  intervalMs: 30000, // Enviar latido cada 30s
  timeoutMs: 10000, // Debe recibir ACK dentro de 10s
  message: () => ({ type: 'ping', timestamp: Date.now() }),
  isAck: (msg) => msg.type === 'pong',
})
```

- El tipo de mensaje de latido debe ser compatible con las definiciones de `outgoing`.
- `isAck` determina si un mensaje entrante es una respuesta de latido. Cuando devuelve `true`, el mensaje no entra en el iterador `receive`.

---

## Composición y prioridad de configuración

Las funciones de configuración se aplican en orden; las posteriores anulan a las anteriores. Las opciones de tiempo de ejecución (`client.execute(cmd, { timeout: 5000 })`) tienen la mayor prioridad, seguidas de la configuración a nivel de cliente.

```typescript
const client = createClient(withEndpoint('https://api.example.com'), withCredentials(true), withSSEOptions({ reconnect: { attempts: 3 } }))

// Anular reconexión SSE en tiempo de ejecución
const [error, stream] = await client.execute(watchLogs(), { reconnect: { attempts: 10 } })
```

## Qué sigue

- [Cliente →](/core/client) — Creación de cliente y uso de `execute`
- [Comandos →](/core/commands) — Definiciones de comandos y reglas de entrada opcional
- [SSE →](/core/sse) — Ejecución SSE, reconexión y manejo de eventos
- [WebSocket →](/core/web-socket) — Conexión WebSocket, latido y gestión de estado
- [Interceptores →](/core/interceptors) — Tipos de interceptor y mecánica de cadena de cebolla

---
title: Client
description: Create explicit clients, configure transport options, and execute HTTP, SSE, and WebSocket commands.
---

# Cliente

`@defjs/core` usa un diseño de **cliente explícito**. Cada petición se ejecuta a través de una instancia de `Client` que tú creas explícitamente. Esto hace que las pruebas, la configuración multi-entorno y el seguimiento de dependencias sean directos.

## Crear un cliente

Usa `createClient` con una o más funciones de configuración.

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

Las funciones de configuración se componen. Las funciones posteriores anulan a las anteriores para la misma clave.

```typescript
import { createClient, withEndpoint, withHTTPHandle, withInterceptors, withCredentials } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withHTTPHandle(myCustomFetch),
  withCredentials(true),
  withInterceptors(loggingInterceptor, authInterceptor),
)
```

### Opciones de configuración

| Función                             | Descripción                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------- |
| `withEndpoint(url)`                 | Dirección base de la API.                                                   |
| `withHTTPHandle(fetch)`             | Implementación `fetch` personalizada para HTTP.                             |
| `withSSEHandle(fetch)`              | Implementación `fetch` personalizada para SSE.                              |
| `withWebSocketHandle(WebSocket)`    | Constructor `WebSocket` personalizado (p. ej., para Node).                  |
| `withInterceptors(...interceptors)` | Registrar interceptores a nivel de transporte. Auto-despachados por `kind`. |
| `withQueryParamsSerializer(fn)`     | Serialización personalizada de parámetros de consulta.                      |
| `withCredentials(boolean)`          | Si incluir credenciales cross-origin.                                       |
| `withXSRF(options)`                 | Comportamiento de lectura e inyección de token XSRF.                        |
| `withSSEOptions(options)`           | Reconexión SSE, cola, manejo de eventos inválidos, etc.                     |
| `withWebSocketOptions(options)`     | Latido WebSocket, reconexión, cola, subprotocolos, etc.                     |

Para configuración específica de SSE y WebSocket, consulta [SSE](/core/sse) y [WebSocket](/core/web-socket).

## Ejecutar comandos

`Client.execute` es un método sobrecargado que despacha a la capa de transporte correcta según el tipo de `Command`.

### Peticiones HTTP

Pasa un comando construido con `defineRequest`. Devuelve una tripla:

```typescript
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
  },
})

const [error, user, response] = await client.execute(getUser())

if (error) {
  console.error(error.code, error.message)
} else {
  console.log(user.id, user.name)
}
```

Tipo de retorno:

```typescript
type HttpAwaitResult<TSuccess, TErrorData> =
  | [error: null, result: TSuccess, response: SettledResponse<TSuccess>]
  | [error: RequestError<TErrorData>, result: undefined, response: SettledResponse<unknown> | undefined]
```

### Flujos de eventos SSE

Pasa un comando construido con `defineEventStream`. Devuelve un manejador de flujo e información de apertura.

```typescript
import { defineEventStream, struct } from '@defjs/core'

const watchLogs = defineEventStream({
  path: '/v1/logs/stream',
  events: {
    log: struct.object({ level: struct.string(), message: struct.string() }),
  },
})

const [error, stream, open] = await client.execute(watchLogs())

if (error) {
  console.error('Stream failed:', error)
  return
}

for await (const event of stream) {
  console.log(event.event, event.data)
}
```

Tipo de retorno:

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

### Conexiones WebSocket

Pasa un comando construido con `defineWebSocket`. Devuelve un objeto de sesión.

```typescript
import { defineWebSocket, struct } from '@defjs/core'

const chat = defineWebSocket({
  path: '/v1/chat',
  incoming: {
    message: struct.object({ text: struct.string() }),
  },
  outgoing: {
    message: struct.object({ text: struct.string() }),
  },
})

const [error, session, connection] = await client.execute(chat())

if (error) {
  console.error('WebSocket failed:', error)
  return
}

session.send({ type: 'message', data: { text: 'hello' } })

for await (const msg of session.receive) {
  console.log(msg.type, msg.data)
}
```

Tipo de retorno:

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, socket: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, socket: undefined, connection: WebSocketConnectionInfo | undefined]
```

## Funciones auxiliares

### `isClient`

Verifica si un valor es una instancia válida de `Client`.

```typescript
import { isClient } from '@defjs/core'

if (isClient(maybeClient)) {
  const result = await maybeClient.execute(someCommand())
}
```

### `getClientConfig`

Extrae el objeto de configuración interna para depuración o construir abstracciones de nivel superior.

```typescript
import { getClientConfig } from '@defjs/core'

const config = getClientConfig(client)
console.log(config.endpoint, config.interceptors.length)
```

Si el valor no es una instancia de `Client`, `getClientConfig` lanza un `TypeError`.

## Diseño de Cliente Explícito

Cada cliente en Defjs se crea explícitamente. Creas un `Client` con `createClient` y lo pasas donde se necesita.

Beneficios de la creación explícita:

- **Amigable con tests**: Pasa diferentes instancias de `Client` directamente a los tests sin necesidad de reiniciar o simular ningún estado.
- **Coexistencia multi-entorno**: Múltiples clientes pueden ejecutarse en paralelo en el mismo proceso (p. ej., API interna + API pública).
- **Transparencia de dependencias**: Los llamadores deben tener explícitamente un `Client`, haciendo las dependencias visibles para análisis estático y revisión de código.

Si necesitas un cliente compartido en tu aplicación, expórtalo desde un módulo:

```typescript
// api/client.ts
import { createClient, withEndpoint } from '@defjs/core'

export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

Luego impórtalo y úsalo en código de negocio:

```typescript
import { apiClient } from './api/client'

const [error, data] = await apiClient.execute(getUser())
```

## Qué sigue

- [Peticiones HTTP →](/core/http) — `defineRequest` y patrones de output
- [SSE →](/core/sse) — Definición SSE, reconexión y colas de eventos
- [WebSocket →](/core/web-socket) — Definición WebSocket, latido y estrategias de reconexión
- [Interceptores →](/core/interceptors) — Tipos de interceptor y mecánica de cadena de cebolla

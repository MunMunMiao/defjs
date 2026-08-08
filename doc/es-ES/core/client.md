---
title: Cliente
description: Crea clientes explícitos, combina opciones, ejecuta comandos específicos de cada transporte e inspecciona la configuración activa.
---

# Cliente

Crea un `Client` de forma explícita y pásalo al código que ejecuta los comandos.

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

El cliente almacena la configuración y distribuye los comandos HTTP, SSE y WebSocket. No gestiona un registro global ni ciclos de vida en segundo plano.

## Composición de opciones

Las opciones se ejecutan de izquierda a derecha.

```typescript
const client = createClient(
  withEndpoint('https://old.example.com'),
  withEndpoint('https://api.example.com'),
  withInterceptors(operationLogger),
  withInterceptors(authInterceptor, retryInterceptor),
)
```

El endpoint final es `https://api.example.com`. El orden de los interceptores es `operationLogger`, `authInterceptor` y, por último, `retryInterceptor`.

La composición sigue tres reglas:

1. Los helpers que asignan un valor sustituyen el anterior. Esto incluye `withEndpoint`, los manejadores de transporte, el serializador de la query, las credenciales, la configuración XSRF y cada opción individual de SSE o WebSocket.
2. `withInterceptors(...items)` añade elementos. Si lo llamas varias veces, conserva el orden en el que se incorporaron los interceptores.
3. `withSSEOptions(...)` y `withWebSocketOptions(...)` sustituyen de forma superficial cada propiedad de primer nivel definida. No combinan en profundidad los objetos anidados de reconexión, heartbeat o cola.

En este ejemplo, el segundo objeto de reconexión sustituye al primero. No conserva `attempts: 5`.

```typescript
const client = createClient(
  withWebSocketOptions({
    reconnect: { attempts: 5, delayMs: 500 },
  }),
  withWebSocketOptions({
    reconnect: { delayMs: 2_000 },
  }),
)
```

Los helpers que agrupan opciones ignoran las propiedades cuyo valor es `undefined`. Cualquier otra propiedad de primer nivel que proporciones sustituye por completo su valor actual.

### Opciones principales

| Opción                           | Efecto                                                                 |
| -------------------------------- | ---------------------------------------------------------------------- |
| `withEndpoint(url)`              | Define el endpoint base absoluto que usan todos los transportes.       |
| `withHTTPHandle(fetch)`          | Sustituye la implementación de Fetch para HTTP.                        |
| `withSSEHandle(fetch)`           | Sustituye la implementación de Fetch para SSE.                         |
| `withWebSocketHandle(WebSocket)` | Sustituye el constructor de WebSocket.                                 |
| `withInterceptors(...items)`     | Añade interceptores de distintos transportes.                          |
| `withQueryParamsSerializer(fn)`  | Sustituye la serialización de la query para HTTP, SSE y WebSocket.     |
| `withCredentials(boolean)`       | Si vale `true`, usa `credentials: 'include'` en Fetch para HTTP y SSE. |
| `withXSRF(options?)`             | Configura la inyección del token XSRF en HTTP.                         |
| `withSSEOptions(options)`        | Sustituye superficialmente las propiedades SSE definidas.              |
| `withWebSocketOptions(options)`  | Sustituye superficialmente las propiedades WebSocket definidas.        |

Los helpers individuales de SSE y WebSocket asignan una sola propiedad de primer nivel. Las páginas de cada transporte detallan sus valores por defecto y las consecuencias para el ciclo de vida.

## Ejecutar comandos

`Client.execute` tiene tres sobrecargas. Todas devuelven una tupla de tres elementos con el error en primer lugar.

### HTTP

```typescript
const [error, data, response] = await client.execute(requestCommand, {
  signal,
  timeout: 5_000,
})
```

El tercer elemento es un wrapper `SettledResponse` de Defjs cuando hay una respuesta disponible. Las opciones HTTP incluyen `abort` o `timeout`, el alias adicional `signal`, `context` y observadores del progreso de subida y descarga.

### SSE

```typescript
const [error, stream, startupOpen] = await client.execute(streamCommand, {
  signal,
})
```

El tercer elemento es la instantánea validada de la apertura inicial. `stream.open` es otro getter, actualizado, que puede cambiar después de los intentos de reconexión. La ejecución SSE acepta cancelación y `HttpContext`; la reconexión y la cola de eventos se configuran en las opciones del cliente.

### WebSocket

```typescript
const [error, session, startupConnection] = await client.execute(socketCommand, {
  signal,
  reconnect: { attempts: 3 },
})
```

El tercer elemento es la instantánea de la conexión inicial. `session.connection` es un getter actualizado y puede describir un intento de conexión física posterior. La ejecución WebSocket acepta cancelación, además de opciones por ejecución para `beforeConnect`, `heartbeat`, `protocols`, `queue` y `reconnect`. No acepta `HttpContext`.

Consulta [Errores](/es-ES/core/errors) para ver las ramas de fallo exactas y [HTTP](/es-ES/core/http), [SSE](/es-ES/core/sse) y [WebSocket](/es-ES/core/web-socket) para conocer el ciclo de vida de cada transporte.

## Ámbito del cliente

Una aplicación de navegador puede mantener un cliente en el ámbito del módulo si su endpoint y sus closures solo contienen estado apto para el navegador e independiente de cada petición.

```typescript
export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

No reutilices un cliente de servidor entre peticiones si sus opciones o interceptores capturan datos de autorización, cookies, tenant, usuario o contexto de petición. Créalo dentro del límite de la petición del servidor.

`Client` no tiene un método `dispose()`. Tampoco registra peticiones, streams ni sesiones activas. El código que inicia el trabajo debe cancelar la petición HTTP, cerrar el manejador SSE o cerrar la sesión WebSocket en el límite correspondiente de su ciclo de vida.

## Inspección avanzada

Usa `isClient(value)` para comprobar en tiempo de ejecución el marcador de cliente.

```typescript
import { isClient } from '@defjs/core'

export function keepClient(value: unknown) {
  return isClient(value) ? value : undefined
}
```

`getClientConfig(client)` devuelve el mismo objeto de configuración mutable que conserva el cliente. No es una instantánea ni una vista de solo lectura.

```typescript
import { getClientConfig, type Client } from '@defjs/core'

export function interceptorCount(client: Client): number {
  return getClientConfig(client).interceptors.length
}
```

Si mutas este objeto, cambias las ejecuciones posteriores y te saltas la composición normal de opciones. Resérvalo para diagnóstico o código de integración revisado con cuidado. `getClientConfig` lanza un `TypeError` si el argumento no es un cliente válido.

## Siguiente paso

- [Comandos](/es-ES/core/commands) define los valores que se pasan a `execute`.
- [Interceptores](/es-ES/core/interceptors) explica el filtrado y el orden de cebolla.
- [Contexto](/es-ES/core/context) cubre los metadatos por petición para HTTP y SSE.

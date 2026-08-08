---
title: Interceptores
description: Filtra interceptores por transporte, compónlos en orden de cebolla, clona peticiones con seguridad, corta la cadena e implementa políticas acotadas de autenticación y reintentos.
---

# Interceptores

Los interceptores envuelven el límite del transporte. HTTP, SSE y WebSocket tienen tipos de interceptor y de resultado distintos.

| Función de creación          | Petición      | Resultado de `next`                   |
| ---------------------------- | ------------- | ------------------------------------- |
| `createHttpInterceptor`      | `HttpRequest` | `Promise<HttpResponse<unknown>>`      |
| `createSSEInterceptor`       | `HttpRequest` | `Promise<EventStreamHandle<unknown>>` |
| `createWebSocketInterceptor` | `HttpRequest` | `Promise<WebSocketSessionLike>`       |

Registra interceptores mezclados mediante `withInterceptors(...)`. El cliente los filtra por `kind` y conserva el orden de registro dentro de cada transporte.

```typescript
const client = createClient(withEndpoint('https://api.example.com'), withInterceptors(httpLogger, sseAuth, socketObserver))
```

## Orden de cebolla

La petición avanza en el orden de registro. El retorno deshace la cadena en orden inverso:

```typescript
const first = createHttpInterceptor(async (request, next) => {
  order.push('first:before')
  const response = await next(request)
  order.push('first:after')
  return response
})

const second = createHttpInterceptor(async (request, next) => {
  order.push('second:before')
  const response = await next(request)
  order.push('second:after')
  return response
})

// first:before -> second:before -> transport
//               <- second:after <- first:after
```

Varias llamadas a `withInterceptors(...)` añaden elementos:

```typescript
createClient(withInterceptors(first), withInterceptors(second, third))
```

## Clona las peticiones con seguridad

Considera que la petición recibida pertenece a la cadena. Crea un objeto `Headers` nuevo antes de modificar las cabeceras:

```typescript
const auth = createHttpInterceptor((request, next) => {
  const token = getAccessToken()
  if (!token) {
    return next(request)
  }

  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return next({ ...request, headers })
})
```

El mismo patrón sirve para las cabeceras SSE. Los constructores WebSocket del navegador no pueden enviar cabeceras arbitrarias durante el handshake, así que cambiar `request.headers` en un interceptor WebSocket no autentica la conexión del navegador.

Para sustituir un cuerpo HTTP, copia la petición con spread y cambia `body`. El límite Fetch detecta que los metadatos del tipo de contenido anterior ya no corresponden al cuerpo nuevo. No reutilices el cuerpo de un `ReadableStream` ya consumido.

## Cortocircuitar la cadena

Un interceptor puede omitir `next`, pero debe devolver el tipo de resultado que espera su transporte. En HTTP, `makeResponse(...)` permite crear un wrapper de Defjs:

```typescript
import { createHttpInterceptor, makeResponse } from '@defjs/core'

declare const isMaintenanceWindow: () => boolean

const maintenanceGate = createHttpInterceptor(async (request, next) => {
  if (isMaintenanceWindow()) {
    return makeResponse({
      status: 503,
      statusText: 'Service Unavailable',
      body: { message: 'Temporarily unavailable' },
    })
  }

  return next(request)
})
```

La capa normal de comandos seguirá seleccionando la salida por estado y aplicando su Struct. Declara ese estado si forma parte del contrato del endpoint.

Para cortar SSE o WebSocket necesitas devolver un manejador o una sesión totalmente compatible, incluida su semántica de cierre. Suele ser bastante más trabajo que devolver una respuesta HTTP sintética.

## Conserva los getters actualizados de la sesión

No envuelvas una sesión WebSocket con `{ ...session }`. El spread lee `state` y `connection` una vez y convierte sus getters actualizados en valores obsoletos. Delega cada miembro de forma explícita:

```typescript
import { createWebSocketInterceptor } from '@defjs/core'

const wrappedSession = createWebSocketInterceptor(async (request, next) => {
  const session = await next(request)

  return {
    get connection() {
      return session.connection
    },
    get state() {
      return session.state
    },
    closed: session.closed,
    receive: session.receive,
    close(code, reason) {
      session.close(code, reason)
    },
    onRuntimeError(listener) {
      return session.onRuntimeError(listener)
    },
    onStateChange(listener) {
      return session.onStateChange(listener)
    },
    send(message) {
      session.send(message)
    },
  }
})
```

El wrapper también debe conservar la responsabilidad sobre el recurso. No debe sustituir `closed`, suprimir `close` ni separar el iterable de entrada salvo que la aplicación haya decidido y documentado expresamente ese comportamiento.

## Logging acotado

Utiliza nombres de operación fijos y un conjunto pequeño de campos revisados:

```typescript
function timingInterceptor(operation: string) {
  return createHttpInterceptor(async (request, next) => {
    const startedAt = performance.now()
    const response = await next(request)

    console.info('outbound request completed', {
      durationMs: Math.round(performance.now() - startedAt),
      operation,
      status: response.status,
    })

    return response
  })
}
```

No registres por defecto URLs de endpoint, cadenas de query, cabeceras, cuerpos, causas sin filtrar, identificadores de eventos SSE ni payloads WebSocket.

## Reintenta HTTP con prudencia

Los reintentos cambian el comportamiento de la aplicación. El ejemplo siguiente se limita a `GET`, `HEAD` y `OPTIONS`; solo reintenta estados `0`, `502`, `503` y `504`; respeta `Retry-After`; se detiene pronto al cancelar; y no reintenta cuerpos que sean streams.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpResponse } from '@defjs/core'

const RETRYABLE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const RETRYABLE_STATUSES = new Set([0, 502, 503, 504])

function isReplayable(request: HttpRequest): boolean {
  return !(typeof ReadableStream !== 'undefined' && request.body instanceof ReadableStream)
}

function retryAfterMs(response: HttpResponse<unknown>): number | undefined {
  const value = response.headers.get('retry-after')
  if (!value) {
    return undefined
  }

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000
  }

  const at = Date.parse(value)
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now())
}

async function abortableWait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw signal.reason
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(finish, ms)

    function finish() {
      signal?.removeEventListener('abort', abort)
      resolve()
    }

    function abort() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      reject(signal?.reason)
    }

    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) {
      abort()
    }
  })
}

function retrySafeHttp(maxRetries = 2) {
  return createHttpInterceptor(async (request, next) => {
    if (!RETRYABLE_METHODS.has(request.method.toUpperCase()) || !isReplayable(request)) {
      return next(request)
    }

    for (let retry = 0; ; retry += 1) {
      const response = await next(request)
      if (!RETRYABLE_STATUSES.has(response.status) || retry >= maxRetries) {
        return response
      }

      const fallback = Math.min(250 * 2 ** retry, 5_000)
      const delay = Math.min(retryAfterMs(response) ?? fallback, 30_000)
      await abortableWait(delay, request.abort)
    }
  })
}
```

Este interceptor no reintenta excepciones lanzadas por otros interceptores porque no puede clasificarlas de forma segura. El estado `0` es el wrapper de fallo de transporte que produce el límite Fetch de Defjs.

No amplíes por costumbre la lista de métodos para incluir escrituras. Reintentar `POST`, `PUT`, `PATCH` o `DELETE` exige un contrato de idempotencia de la aplicación, cuerpos que se puedan volver a enviar, soporte del servidor y una política de estados revisada.

## Autenticación Basic

La entrada raíz exporta `basicAuthHttpInterceptor(...)` y `basicAuthSSEInterceptor(...)`.

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(
    basicAuthHttpInterceptor(() => credentials),
    basicAuthSSEInterceptor(() => credentials),
  ),
)
```

Las credenciales Basic solo se codifican en base64, no se cifran. Usa TLS. El codificador por defecto utiliza `globalThis.btoa`, que puede no estar disponible y solo acepta un juego de caracteres limitado. Proporciona `options.encode` cuando el entorno no tenga `btoa` o las credenciales necesiten una implementación UTF-8/base64 revisada.

Los proveedores de credenciales se ejecutan cuando una petición atraviesa el interceptor. En servidor, mantenlos dentro del ámbito de la petición y no registres la cabecera resultante.

## Seguridad de observadores y callbacks

Los interceptores SSE y WebSocket pueden conectar observadores de ciclo de vida a los manejadores devueltos. Da de baja los listeners WebSocket cuando termine su propietario. Haz que listeners y predicados no lancen excepciones; las implementaciones de tiempo real actuales no aíslan todos los fallos de listeners o predicados de reconexión.

Un interceptor puede lanzar o rechazar una promesa. El transporte de alto nivel puede normalizar algunos fallos como `RequestError`, pero el código del interceptor no debe depender de una garantía general de que nunca habrá rechazo.

## Siguiente paso

- [Client](/es-ES/core/client) explica el registro y la composición de opciones.
- [HTTP](/es-ES/core/http) documenta el wrapper Fetch y el comportamiento del estado 0.
- [SSE](/es-ES/core/sse) y [WebSocket](/es-ES/core/web-socket) describen el ciclo de vida de cada transporte.

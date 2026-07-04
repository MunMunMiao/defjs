---
title: OpenTelemetry Server
description: Server-side outbound tracing without SDK initialization. Supports HTTP, SSE, and WebSocket with OpenTelemetry metrics and trace collection.
---

# @defjs/opentelemetry-server

Paquete de integración OpenTelemetry para el lado del servidor, proporcionando recolección de trazas y métricas outbound para clientes HTTP, SSE y WebSocket de `@defjs/core`.

**Posicionamiento core**:

- **Entorno de servidor** (Node.js, Bun, Deno), no dependiente del entorno del navegador.
- **No inicializa el SDK** — Debes inicializar el SDK de OpenTelemetry externamente, luego pasar el `Tracer` creado (y opcionalmente `Meter`).
- **Separación por transporte** — HTTP, SSE y WebSocket tienen interceptores independientes, ciclos de vida de span y dimensiones de métricas.

## Configuración del workspace del repositorio

Esta página documenta actualmente el uso de source/workspace dentro de este repositorio. `@defjs/opentelemetry-server` vive en `packages/opentelemetry-server`, y su peer dependency espera la versión de workspace correspondiente de `@defjs/core` en `packages/core`.

Los import specifiers que aparecen abajo usan nombres de paquete, pero dentro de este repositorio se resuelven contra paquetes fuente del workspace, no contra un par de paquetes publicados en un registry. Sigue instalando e inicializando por separado las dependencias del SDK de OpenTelemetry de tu aplicación.

El npm público no ofrece actualmente `@defjs/opentelemetry-server`, y la versión standalone más reciente de `@defjs/core` disponible allí no es un peer compatible para este paquete del workspace. Si más adelante publicas tanto `@defjs/opentelemetry-server` como una versión compatible de `@defjs/core` en un registry que controles, o en otro registry que distribuya ambas versiones, instala juntas esas dos versiones publicadas en ese entorno en lugar de mezclar este paquete del workspace con una versión standalone incompatible de `@defjs/core`.

## Uso básico

Pasa un `Tracer` creado externamente y configura el cliente mediante `withOpenTelemetryServer`:

```typescript
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { trace } from '@opentelemetry/api'

// 1. Inicializar SDK de OpenTelemetry externamente, luego obtener tracer
const tracer = trace.getTracer('my-service')

// 2. Inyectar tracer en la configuración del cliente
const client = createClient(withEndpoint('https://api.example.com'), withOpenTelemetryServer({ tracer }))
```

## Configuración completa

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withOpenTelemetryServer({
    tracer, // Requerido
    meter, // Opcional, métricas solo recolectadas cuando se proporciona
    propagator, // Opcional, por defecto W3C TraceContext + Baggage
    requireParentSpan: false,
    http: {
      enabled: true,
      requestHook(span, req) {
        span.setAttribute('defjs.operation', req.endpoint)
      },
      responseHook(span, res) {
        span.setAttribute('defjs.response.status_text', res.statusText)
      },
    },
    sse: {
      enabled: true,
    },
    webSocket: {
      enabled: true,
      queryPropagation: false,
    },
  }),
)
```

### Opciones de configuración

| Opción              | Tipo                                  | Por defecto                | Descripción                                                  |
| ------------------- | ------------------------------------- | -------------------------- | ------------------------------------------------------------ |
| `tracer`            | `Tracer`                              | **Requerido**              | Tracer de OpenTelemetry externo                              |
| `meter`             | `Meter`                               | `undefined`                | Meter de OpenTelemetry externo, omitir desactiva métricas    |
| `propagator`        | `TextMapPropagator`                   | W3C TraceContext + Baggage | Propagador de contexto personalizado                         |
| `requireParentSpan` | `boolean`                             | `false`                    | Solo crear spans outbound cuando existe un span padre activo |
| `http`              | `OpenTelemetryServerHttpOptions`      | `{}`                       | Opciones de traza/métrica para transporte HTTP               |
| `sse`               | `OpenTelemetryServerSSEOptions`       | `{}`                       | Opciones de traza/métrica para transporte SSE                |
| `webSocket`         | `OpenTelemetryServerWebSocketOptions` | `{}`                       | Opciones de traza/métrica para transporte WebSocket          |

### Opciones HTTP

| Opción         | Tipo                  | Por defecto | Descripción                                                                      |
| -------------- | --------------------- | ----------- | -------------------------------------------------------------------------------- |
| `enabled`      | `boolean`             | `true`      | Habilitar trazado HTTP                                                           |
| `requestHook`  | `(span, req) => void` | `undefined` | Personalizar span HTTP antes de la petición, `req` es `HttpRequest`              |
| `responseHook` | `(span, res) => void` | `undefined` | Personalizar span HTTP después de la respuesta, `res` es `HttpResponse<unknown>` |

### Opciones SSE

| Opción         | Tipo                     | Por defecto | Descripción                                                                                               |
| -------------- | ------------------------ | ----------- | --------------------------------------------------------------------------------------------------------- |
| `enabled`      | `boolean`                | `true`      | Habilitar trazado SSE                                                                                     |
| `requestHook`  | `(span, req) => void`    | `undefined` | Personalizar span SSE antes de la petición de flujo                                                       |
| `responseHook` | `(span, stream) => void` | `undefined` | Personalizar span SSE después de devolver el manejador de flujo, `stream` es `EventStreamHandle<unknown>` |

### Opciones WebSocket

| Opción             | Tipo                      | Por defecto | Descripción                                                                                    |
| ------------------ | ------------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| `enabled`          | `boolean`                 | `true`      | Habilitar trazado WebSocket                                                                    |
| `queryPropagation` | `boolean`                 | `true`      | Inyectar contexto de traza en la cadena de consulta de la URL WebSocket para compatibilidad con navegador. Para tráfico de producción sensible a seguridad, la línea base recomendada es establecerlo explícitamente en `false`. |
| `requestHook`      | `(span, req) => void`     | `undefined` | Personalizar span WebSocket antes de la petición de conexión                                   |
| `responseHook`     | `(span, session) => void` | `undefined` | Personalizar span WebSocket después de devolver la sesión, `session` es `WebSocketSessionLike` |

> **Manejo de excepciones en hooks**: Si `requestHook` o `responseHook` lanza, el error se registra en el evento `defjs.otel.hook.error` del span, pero la petición/flujo/sesión del cliente **continúa normalmente**.
>
> **Higiene de atributos**: En `requestHook` / `responseHook`, prioriza allowlists explícitas, redaction y atributos estables de baja cardinalidad. No adjuntes cadenas de consulta crudas, cuerpos de petición o respuesta, cabeceras completas, valores de baggage ni payloads de mensaje salvo que tu aplicación ya haya revisado los requisitos de privacidad, cardinalidad, retención y redaction.

## Migración desde la API antigua

| Configuración antigua     | Configuración nueva                                             |
| ------------------------- | --------------------------------------------------------------- |
| `http: false`             | `http: { enabled: false }`                                      |
| `sse: false`              | `sse: { enabled: false }`                                       |
| `webSocket: false`        | `webSocket: { enabled: false }`                                 |
| `requestHook`             | `http.requestHook` / `sse.requestHook` / `webSocket.requestHook` |
| `responseHook`            | `http.responseHook` / `sse.responseHook` / `webSocket.responseHook` |
| `webSocketQueryPropagation` | `webSocket.queryPropagation`                                  |

Los hooks antiguos de nivel superior y los toggles booleanos de transporte se eliminaron intencionalmente para que cada transporte exponga los tipos correctos de request/response. Pasar ahora esas opciones antiguas eliminadas desde JavaScript lanza un error de migración en lugar de interpretarlas silenciosamente como instrumentación habilitada.

## Convenciones semánticas HTTP y métricas

El trazado HTTP sigue las convenciones semánticas estables de cliente HTTP de OpenTelemetry. Por defecto, registra spans `SpanKind.CLIENT` con los siguientes atributos principales:

- `http.request.method`
- `url.full`
- `server.address`
- `server.port`
- `http.response.status_code`

Cuando se proporciona `meter`, se recolectan las siguientes métricas estables:

| Métrica                        | Unidad | Atributos                                                                                                                             |
| ------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `http.client.request.duration` | `s`    | `http.request.method`, opcional `http.response.status_code`, opcional `server.address`, opcional `server.port`, opcional `error.type` |

Por defecto, **este paquete no añade cuerpos de petición/respuesta, cabeceras completas, valores de baggage, tamaños de payload ni payloads de mensajes como campos de telemetría personalizados**. Tampoco **crea atributos de span ni métricas separados para cadenas de consulta sin procesar**. Pero `url.full` refleja la URL que realmente construye tu aplicación, así que si esa URL ya incluye query strings, también pueden aparecer ahí. Evita poner tokens, user ids u otras entradas sensibles o de alta cardinalidad en las URL cuando sea posible.

No añadas cadenas de consulta crudas, cuerpos de petición o respuesta, cabeceras completas, valores de baggage ni payloads de mensaje a spans o métricas salvo que la aplicación ya haya revisado los requisitos de privacidad, cardinalidad, retención y redaction. Al extender la telemetría mediante hooks, prefiere allowlists explícitas, redaction y atributos estables de baja cardinalidad.

## Trazado a nivel de conexión SSE y métricas personalizadas

SSE es una respuesta HTTP de larga duración. La duración normal de petición HTTP termina en el establecimiento del flujo, lo cual no refleja si el flujo sigue ejecutándose, fue interrumpido o dio error. Por tanto, este paquete trata SSE como telemetría **a nivel de conexión**.

### Ciclo de vida del span

El span SSE permanece abierto hasta que `stream.closed` se resuelve, registrando los siguientes eventos de ciclo de vida:

- `sse.connected` — Flujo establecido exitosamente
- `sse.closed` — Fin normal del flujo (EOF del servidor)
- `sse.aborted` — Cierre activo mediante `stream.close()`
- `sse.error` — Error de conexión o agotamiento de reconexiones

### Métricas personalizadas

Cuando se proporciona `meter`, se recolectan las siguientes métricas personalizadas de defjs (no convenciones semánticas oficiales estables de OpenTelemetry):

| Métrica                                | Unidad     | Significado                                                       |
| -------------------------------------- | ---------- | ----------------------------------------------------------------- |
| `defjs.client.sse.connect.duration`    | `s`        | Tiempo para establecer conexión de flujo                          |
| `defjs.client.sse.connection.duration` | `s`        | Duración total desde establecimiento del flujo hasta cierre/error |
| `defjs.client.sse.active_streams`      | `{stream}` | Cantidad actual de flujos SSE activos                             |

Por defecto, **no se crean spans por evento**, y **los payloads de eventos, IDs de eventos, `Last-Event-ID`, latencia de entrega, eventos perdidos o colas de reconexión no se recolectan**. Estas son semánticas a nivel de aplicación que pueden producir telemetría de alta cardinalidad o sensible. Impleméntalas en la capa de aplicación si es necesario.

## Trazado a nivel de conexión WebSocket y métricas personalizadas

WebSocket comienza con un handshake HTTP Upgrade, pero los entornos de producción se preocupan más por el ciclo de vida post-handshake: conexiones activas, duración de conexión, comportamiento de cierre/error y tasa de fallo de conexión. Dado que las convenciones semánticas WebSocket de OpenTelemetry aún no son estables, este paquete usa métricas personalizadas a nivel de conexión.

### Ciclo de vida del span

El span WebSocket permanece abierto hasta que `session.closed` se resuelve, registrando los siguientes eventos de ciclo de vida:

- `websocket.connected` — Sesión establecida exitosamente
- `websocket.closed` — Cierre normal de conexión
- `websocket.error` — Error de conexión

### Métricas personalizadas

Cuando se proporciona `meter`, se recolectan las siguientes métricas personalizadas de defjs:

| Métrica                                      | Unidad         | Significado                                                       |
| -------------------------------------------- | -------------- | ----------------------------------------------------------------- |
| `defjs.client.websocket.connect.duration`    | `s`            | Tiempo para establecer sesión WebSocket                           |
| `defjs.client.websocket.connection.duration` | `s`            | Duración total desde establecimiento de sesión hasta cierre/error |
| `defjs.client.websocket.active_connections`  | `{connection}` | Cantidad actual de conexiones WebSocket activas                   |

Por defecto, **no se crean spans por mensaje**, y **los payloads de mensaje, tamaños de mensaje, contrapresión, cantidad en buffer, subprotocolos o colas de reconexión no se recolectan**. La telemetría a nivel de mensaje debe implementarse en la capa de aplicación con estrategias de muestreo.

## Riesgo de seguridad de propagación por query en WebSocket

Los clientes WebSocket de navegador normalmente no pueden establecer cabeceras HTTP arbitrarias, así que `webSocket.queryPropagation` tiene como valor por defecto `true` para compatibilidad. Ese valor por defecto inyecta el contexto de traza en la cadena de consulta de la URL WebSocket.

Las cadenas de consulta pueden quedar registradas por proxies, navegadores, herramientas APM, logs de acceso y herramientas de depuración de red. También pueden contener tokens, user ids u otras entradas de alta cardinalidad. Si el propagador incluye `baggage`, los valores de baggage también pueden escribirse en la URL y exponer datos sensibles.

Para tráfico WebSocket de producción sensible a seguridad, desactiva explícitamente la propagación por query como línea base recomendada:

```typescript
withOpenTelemetryServer({
  tracer,
  webSocket: { queryPropagation: false },
})
```

Después de desactivarla, el contexto de traza deja de viajar en la URL WebSocket. Si el servidor todavía necesita vincular la conexión con una traza, usa en la capa de aplicación otro mecanismo de correlación ya revisado.

## Qué sigue

- [Client](/core/client) — `createClient` y configuración completa de transportes
- [SSE](/core/sse) — `defineEventStream` y consumo de eventos de streaming
- [WebSocket](/core/web-socket) — `defineWebSocket` y comunicación en tiempo real

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

## Instalación

```bash
bun add @defjs/opentelemetry-server @opentelemetry/api @opentelemetry/core
```

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
| `queryPropagation` | `boolean`                 | `true`      | Inyectar contexto de traza en la cadena de consulta de la URL WebSocket                        |
| `requestHook`      | `(span, req) => void`     | `undefined` | Personalizar span WebSocket antes de la petición de conexión                                   |
| `responseHook`     | `(span, session) => void` | `undefined` | Personalizar span WebSocket después de devolver la sesión, `session` es `WebSocketSessionLike` |

> **Manejo de excepciones en hooks**: Si `requestHook` o `responseHook` lanza, el error se registra en el evento `defjs.otel.hook.error` del span, pero la petición/flujo/sesión del cliente **continúa normalmente**.

## Convenciones semánticas HTTP y métricas

El trazado HTTP sigue las convenciones semánticas estables de cliente HTTP de OpenTelemetry. Por defecto, registra spans `SpanKind.CLIENT` con los siguientes atributos de baja cardinalidad:

- `http.request.method`
- `url.full`
- `server.address`
- `server.port`
- `http.response.status_code`

Cuando se proporciona `meter`, se recolectan las siguientes métricas estables:

| Métrica                        | Unidad | Atributos                                                                                                                             |
| ------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `http.client.request.duration` | `s`    | `http.request.method`, opcional `http.response.status_code`, opcional `server.address`, opcional `server.port`, opcional `error.type` |

Por defecto, **los cuerpos de petición/respuesta, todas las cabeceras, cadenas de consulta crudas, tamaños de payload y detalles de eventos de red no se recolectan**. Estos son típicamente de alta cardinalidad o sensibles. Añádelos explícitamente mediante `requestHook` / `responseHook` si es necesario.

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

Los clientes WebSocket de navegador típicamente no pueden establecer cabeceras HTTP arbitrarias, así que este paquete por defecto inyecta el contexto de traza en la cadena de consulta de la URL WebSocket para compatibilidad con navegador.

Esta elección tiene un trade-off de seguridad: las cadenas de consulta pueden aparecer en logs de acceso, logs de proxy, herramientas de depuración de navegador/red y campos URL de APM. Si el propagador incluye `baggage`, los valores de baggage también se escriben en la URL, potencialmente transportando datos sensibles.

Para tráfico WebSocket sensible a seguridad, desactiva explícitamente la propagación por query:

```typescript
withOpenTelemetryServer({
  tracer,
  webSocket: { queryPropagation: false },
})
```

Tras desactivar, el contexto de traza ya no se propaga mediante URL. El servidor debe confiar en otros mecanismos para la correlación de trazas (p. ej., campos de ID de traza en el protocolo de mensaje a nivel de aplicación).

## Qué sigue

- [Client](/core/client) — `createClient` y configuración completa de transportes
- [SSE](/core/sse) — `defineEventStream` y consumo de eventos de streaming
- [WebSocket](/core/web-socket) — `defineWebSocket` y comunicación en tiempo real

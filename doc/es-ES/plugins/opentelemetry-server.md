---
title: OpenTelemetry Server
description: Instrumenta clientes Defjs salientes HTTP, SSE y WebSocket con un Tracer y, opcionalmente, un Meter de OpenTelemetry proporcionados por la aplicación.
---

# `@defjs/opentelemetry-server`

A pesar del nombre del paquete, este adaptador instrumenta el trabajo saliente de clientes Defjs. No instrumenta peticiones entrantes del servidor ni inicializa un SDK de OpenTelemetry.

La aplicación es responsable de:

- inicializar el SDK y los proveedores;
- configurar exportadores y procesadores;
- configurar el gestor de contexto y el contexto activo;
- definir el muestreo, la política de atributos y el enmascarado de datos sensibles;
- forzar el volcado y cerrar los recursos.

Pasa a `withOpenTelemetryServer(...)` un `Tracer` de la aplicación y, si necesitas métricas, un `Meter`.

## Configurar el cliente

```typescript
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { metrics, trace } from '@opentelemetry/api'

// Initialize and register the application's SDK/providers before this point.
const tracer = trace.getTracer('orders-service')
const meter = metrics.getMeter('orders-service')

const client = createClient(
  withEndpoint('https://api.example.com'),
  withOpenTelemetryServer({
    tracer,
    meter,
    webSocket: {
      queryPropagation: false,
    },
  }),
)
```

El adaptador añade un interceptor por cada transporte habilitado. Las opciones se ejecutan en el orden normal del cliente, por lo que su posición respecto a otros interceptores determina qué trabajo envuelve cada span.

## Opciones

```typescript
interface OpenTelemetryServerOptions {
  tracer: Tracer
  meter?: Meter
  propagator?: TextMapPropagator
  requireParentSpan?: boolean
  http?: OpenTelemetryServerHttpOptions
  sse?: OpenTelemetryServerSSEOptions
  webSocket?: OpenTelemetryServerWebSocketOptions
}
```

Las opciones de los tres transportes aceptan `enabled?: boolean`, `requestHook` y `responseHook`. WebSocket acepta además `queryPropagation?: boolean`.

Los tres transportes están habilitados por defecto. Utiliza un objeto de opciones para deshabilitar uno:

```typescript
withOpenTelemetryServer({
  tracer,
  http: { enabled: false },
  sse: { enabled: true },
  webSocket: { enabled: false },
})
```

Los antiguos campos booleanos de transporte, los hooks de primer nivel y `webSocketQueryPropagation` se rechazan en tiempo de ejecución con errores de migración. Las formas actuales son objetos de opciones por transporte, hooks dentro de su transporte y `webSocket.queryPropagation`.

## Propagación

Si omites `propagator`, el paquete crea su propio `CompositePropagator` con W3C Trace Context y W3C Baggage. No lee la configuración del propagador global.

HTTP y SSE inyectan en las cabeceras de la petición todos los campos que produzca ese propagador. Si `req.headers` ya es una instancia de `Headers`, la implementación actual reutiliza y modifica esa misma instancia. En caso contrario, crea un objeto `Headers` nuevo. La propagación por query de WebSocket está desactivada por defecto. Solo `queryPropagation: true` la habilita; como los sockets del navegador no pueden añadir cabeceras arbitrarias durante el handshake, se añaden entonces a la cadena de query de la conexión todos los campos producidos por el propagador.

Antes de crear un span, cada interceptor también llama a `propagator.extract(...)` con las cabeceras de la petición. Trata ese carrier como una entrada de confianza controlada por la aplicación. No permitas que un llamador no fiable aporte `traceparent`, `tracestate` o `baggage`: esos campos pueden sustituir el contexto padre activo. Elimina o normaliza los campos de propagación no fiables antes de que la petición llegue a este interceptor.

```typescript
withOpenTelemetryServer({
  tracer,
  webSocket: {
    queryPropagation: true,
  },
})
```

Revisa la propagación por URL antes de activarla. El contexto de traza y el baggage pueden quedar registrados en navegadores, proxies, logs de acceso y sistemas de telemetría. Un propagador personalizado puede añadir más campos aparte de `traceparent`. Si el servidor lo admite, prefiere un primer mensaje revisado como parte del protocolo o un ticket de conexión de corta duración y un solo uso.

`requireParentSpan: true` comprueba si hay un span padre activo antes de realizar cualquier instrumentación. Si no lo hay, omite la creación del span, la propagación, los hooks y las métricas, y llama sin cambios al siguiente manejador.

## Comportamiento de los hooks

Los hooks reciben el span y la petición o resultado propios del transporte:

```typescript
withOpenTelemetryServer({
  tracer,
  http: {
    requestHook(span, request) {
      span.setAttribute('app.operation', 'list-orders')
    },
    responseHook(span, response) {
      span.setAttribute('app.result_class', response.status < 500 ? 'accepted' : 'server-error')
    },
  },
})
```

Los hooks pueden devolver `void` o `Promise<void>` y siguen siendo no bloqueantes. Las excepciones síncronas y los rechazos asíncronos se capturan y registran como `defjs.otel.hook.error` sin detener la operación del cliente; también se aíslan los errores al registrar esa telemetría.

Utiliza atributos permitidos explícitamente y de baja cardinalidad. No adjuntes cabeceras sin filtrar, cadenas de query, cuerpos, baggage, IDs de evento, payloads de mensajes ni credenciales.

## Semántica HTTP

El interceptor HTTP crea un span `SpanKind.CLIENT` y registra:

- `http.request.method`;
- `url.full`;
- `server.address` y, si existe, `server.port`;
- `http.response.status_code` después de recibir una respuesta.

Esto no supone que cumpla por completo las convenciones semánticas HTTP.

El comportamiento actual de los estados es más limitado de lo que esperan muchas aplicaciones:

- un estado `500` o superior marca el span como `ERROR`;
- los estados entre `400` y `499` lo marcan como `OK`;
- una respuesta de transporte Defjs con estado 0 lo marca como `OK`;
- un error lanzado a través del interceptor lo marca como `ERROR` y registra una excepción.

El span HTTP termina cuando el interceptor HTTP recibe el `HttpResponse` de Defjs. La selección de salida de alto nivel por estado y la decodificación Struct se producen después de que el interceptor haya devuelto el control. Por tanto, un `RESPONSE_VALIDATION_FAILED` o `UNDECLARED_STATUS` posterior no puede actualizar el span ya terminado.

Cuando proporcionas un Meter, HTTP registra `http.client.request.duration` en segundos. Los atributos incluyen el método, la dirección y el puerto del servidor, el estado opcional de la respuesta y un `error.type` opcional para errores lanzados.

## Semántica SSE

Después de un arranque SSE correcto, el span permanece abierto hasta que se resuelve `stream.closed`. Registra `sse.connected` y, en las rutas de cierre cubiertas, uno entre `sse.closed`, `sse.aborted` y `sse.error`.

Con un Meter, SSE instrumenta:

| Métrica                                | Significado                                                                |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `defjs.client.sse.connect.duration`    | Tiempo hasta que se devuelve el manejador lógico del stream.               |
| `defjs.client.sse.connection.duration` | Tiempo desde que se devuelve el manejador hasta el cierre definitivo.      |
| `defjs.client.sse.active_streams`      | Número de manejadores lógicos cuya promesa `closed` aún no se ha resuelto. |

Son métricas personalizadas de Defjs. El contador activo incluye el tiempo entre intentos de reconexión física. No cuenta conexiones HTTP abiertas en ese momento.

## Semántica WebSocket

Después de un arranque correcto, el span WebSocket permanece abierto hasta que se resuelve `session.closed`. Registra `websocket.connected` y, en las rutas cubiertas, `websocket.closed` o `websocket.error`.

Con un Meter, WebSocket utiliza:

| Métrica                                      | Significado                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| `defjs.client.websocket.connect.duration`    | Tiempo hasta que se devuelve la sesión lógica.                          |
| `defjs.client.websocket.connection.duration` | Tiempo desde que se devuelve la sesión hasta el cierre definitivo.      |
| `defjs.client.websocket.active_connections`  | Número de sesiones lógicas cuya promesa `closed` aún no se ha resuelto. |

Aunque el nombre de la métrica habla de conexiones, la implementación cuenta sesiones lógicas, incluidos los intervalos de espera entre reconexiones. No cuenta sockets físicos.

Aquí no hay convenciones semánticas genéricas y estables para WebSocket. El paquete no crea un span por mensaje ni registra por defecto payloads o tamaños de cola.

## Datos sensibles y límites de cobertura

El valor por defecto de `url.full` se resuelve a partir del endpoint y el endpoint base de la petición, no de la cadena de query serializada. Aun así, las rutas resueltas pueden contener identificadores sensibles. Por separado, la propagación WebSocket sí añade campos a la cadena de query real.

`recordException(...)` recibe errores lanzados y determinadas causas de cierre. Los mensajes y las trazas de pila pueden exponer datos sensibles. Configura procesadores en el SDK y enmascarado de datos sensibles en el exportador según corresponda; este adaptador no sanea las excepciones en nombre de la aplicación.

Antes de desplegar, valida el adaptador con el SDK, exporters, processors, context manager e instrumentación automática de tu servicio. Comprueba baggage de extremo a extremo, enmascarado de datos sensibles, cierre y volcado, y spans duplicados con tráfico real.

## Siguiente paso

- [Interceptores](/es-ES/core/interceptors) explica el orden respecto a otros interceptores del cliente.
- [SSE](/es-ES/core/sse) y [WebSocket](/es-ES/core/web-socket) explican la duración de los manejadores y sesiones lógicos que cuentan estas métricas.

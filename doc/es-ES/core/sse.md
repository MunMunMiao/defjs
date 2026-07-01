---
title: SSE
description: Usa defineEventStream para definir endpoints SSE (Server-Sent Events) tipados y consumir eventos de streaming a través del cliente.
---

# SSE

Defjs usa `defineEventStream` para definir endpoints SSE (Server-Sent Events) tipados. Tras la ejecución, se devuelve una trípla `[error, stream, openInfo]`, donde `stream` es un iterable asíncrono para consumir eventos enviados por el servidor uno a uno.

## Definir un flujo de eventos

Al definir un endpoint SSE, declara el campo `events` mapeando nombres de eventos a structs. El transporte SSE entrega cada payload `data:` como texto plano; Defjs selecciona el struct coincidente y decodifica el texto según el tipo de contenido de ese struct.

```typescript
import { createClient, defineEventStream, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const useNotifications = defineEventStream({
  path: '/v1/notifications',
  events: {
    message: struct.json(
      struct.object({
        id: struct.number(),
        text: struct.string(),
      }),
    ),
    heartbeat: struct.string(),
  },
})
```

### Esquema de evento por defecto

Si el servidor puede enviar tipos de evento no declarados explícitamente en `events`, proporciona un struct `default` como respaldo. Sin `default`, los eventos desconocidos se descartan silenciosamente.

```typescript
const useMixedStream = defineEventStream({
  path: '/v1/events',
  events: {
    userconnect: struct.json(struct.object({ uid: struct.number() })),
    default: struct.json(struct.object({ note: struct.string() })),
  },
})
```

### Decodificación del contenido de los datos de eventos

El transporte SSE entrega cada payload `data:` como texto. Defjs primero selecciona el struct del evento desde `events[eventName] ?? events.default`, y luego decodifica el texto según el struct seleccionado.

Usa `struct.json(inner)` cuando el servidor envíe texto JSON para un evento. `struct.json(inner)` primero ejecuta `JSON.parse` sobre el texto SSE crudo, y luego parsea el valor resultante con `inner`:

```typescript
const useProfileStream = defineEventStream({
  path: '/v1/profile-events',
  events: {
    profile: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  },
})
```

Para payloads de texto primitivo:

- `struct.string()` y `struct.text()` leen el texto del evento tal cual.
- `struct.number()` recorta el texto y acepta solo valores numéricos finitos.
- `struct.boolean()` recorta el texto y acepta solo los valores exactos `true` o `false`.

Los `struct.object(...)`, `struct.array(...)` y `struct.record(...)` planos no parsean por sí solos textos que parezcan JSON. Envuélvelos en `struct.json(...)` para datos de eventos en JSON.

### Flujos de eventos con entrada

Cuando un flujo necesita parámetros de ruta, parámetros de consulta o cuerpo de petición, proporciona un struct `input` y una función `build`. La firma de `build` es la misma que `defineRequest`, admitiendo params, query y headers.

```typescript
const useRoomStream = defineEventStream({
  path: '/v1/room/:roomId',
  input: struct.request({
    path: struct.object({ roomId: struct.string() }),
  }),
  build(ctx, input) {
    ctx.setPathParams(input.path)
  },
  events: {
    chat: struct.json(struct.object({ user: struct.string(), text: struct.string() })),
  },
})

const [error, stream, open] = await client.execute(useRoomStream({ path: { roomId: '42' } }))
```

## Resultado de ejecución

`client.execute()` devuelve una trípla para comandos SSE:

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

- **`error`** — No nulo en fallo de conexión o validación; `null` en éxito.
- **`stream`** — En éxito, un `EventStreamHandle` consumible mediante `for await...of`; `undefined` en fallo.
- **`open`** — Contiene información de respuesta de primera conexión (`response` y `url`). Puede ser `undefined` en fallo de conexión.

```typescript
const [error, stream, open] = await client.execute(useNotifications())

if (error) {
  console.error('Connection failed:', error)
  return
}

console.log('Connected', open?.url)

for await (const event of stream) {
  if (event.event === 'message' && typeof event.data === 'object' && event.data !== null) {
    console.log('Message:', event.data.text)
  }
  if (event.event === 'heartbeat') {
    console.log('Heartbeat:', event.data)
  }
}
```

## EventStreamHandle y stream.closed

`EventStreamHandle` implementa `AsyncIterable`, así que puede usarse directamente con `for await...of`. También proporciona estas propiedades:

| Propiedad / Método         | Descripción                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `open`                     | Primera conexión `EventStreamOpenInfo` (contiene `response` y `url`)                 |
| `closed`                   | `Promise<EventStreamCloseInfo>`, se resuelve cuando el flujo se cierra completamente |
| `close(reason?)`           | Cierra activamente el flujo, opcionalmente pasando una razón                         |
| `[Symbol.asyncIterator]()` | Devuelve un iterador asíncrono que consume la cola de eventos                        |

`closed` se resuelve cuando:

- El servidor finaliza normalmente (`code: 'eof'`)
- Cierre activo mediante `stream.close()` (`code: 'aborted'`)
- Error de conexión o agotamiento de reconexiones (`code: 'error'`)

```typescript
// Cierre activo
stream.close('user-navigated-away')
await stream.closed // { code: 'aborted', reason: 'user-navigated-away' }
```

## Manejo de eventos inválidos: onInvalidEvent

Cuando el servidor envía un evento que no puede coincidir con ningún struct en `events` (o `default`), o la validación del struct falla, se activa el observador `onInvalidEvent`. Es una configuración a nivel de cliente pasada mediante `sse.onInvalidEvent` en `createClient`.

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    onInvalidEvent: async (context) => {
      console.warn('Invalid event:', context.reason, context.message)
      // context.reason: 'missing-struct' | 'validation-failed'
      // context.message: { id, event, data, retry? }
      // context.cause: Error original cuando la validación falla
    },
  }),
)
```

`onInvalidEvent` es un **observador**:

Un fallo de validación común es declarar `struct.object(...)` para un evento cuyo campo `data:` es texto JSON. Declara `struct.json(struct.object(...))` en su lugar. El JSON inválido bajo `struct.json(...)` se reporta como `validation-failed` y no se reintenta como texto plano.

- Incluso si lanza internamente, la excepción se ignora silenciosamente y el flujo continúa.
- No bloquea el consumo de eventos subsecuentes.

## Configuración de reconexión y cola

El transporte SSE tiene reconexión automática integrada, configurable mediante `sse.reconnect` y `sse.queue` a nivel de cliente.

### Configuración de reconexión

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    reconnect: {
      attempts: 5, // Máximo de intentos de reintento
      delayMs: 1000, // Intervalo inicial de reintento
      factor: 2, // Multiplicador de backoff exponencial
      maxDelayMs: 30000, // Intervalo máximo de reintento
      jitter: 1000, // Rango de jitter aleatorio (ms)
      shouldReconnect: async ({ attempt, cause, lastEventId }) => {
        return attempt <= 3
      },
    },
  }),
)
```

Prioridad de reconexión:

1. Si `onerror` devuelve `null`, detener reconexión.
2. Si `shouldReconnect` devuelve `false`, detener reconexión.
3. Si se excede el límite `attempts`, detener reconexión.
4. De lo contrario, calcular el siguiente intervalo de reintento usando `delayMs` + backoff exponencial `factor` + `jitter`.

> La reconexión lleva automáticamente la cabecera `Last-Event-ID` para que el servidor pueda reanudar desde el punto de interrupción.

### Configuración de cola

Los eventos entran en una cola asíncrona interna tras llegar, luego son consumidos por el iterador. Puedes limitar el tamaño de la cola y el comportamiento de desbordamiento:

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    queue: {
      maxSize: 100,
      overflow: 'drop-oldest', // 'drop-newest' | 'drop-oldest' | 'error'
    },
  }),
)
```

| `overflow`    | Comportamiento                                                      |
| ------------- | ------------------------------------------------------------------- |
| `drop-newest` | Descarta eventos recién llegados, mantiene eventos antiguos en cola |
| `drop-oldest` | Descarta eventos más antiguos, hace espacio para eventos nuevos     |
| `error`       | Cola llena lanza error, causando cierre del flujo                   |

## Ejemplo completo

```typescript
import { createClient, defineEventStream, struct, withEndpoint, withSSEOptions } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    reconnect: { attempts: 5, delayMs: 1000, factor: 2, maxDelayMs: 30000 },
    queue: { maxSize: 100, overflow: 'drop-oldest' },
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
    },
  }),
)

const useLogStream = defineEventStream({
  path: '/v1/logs',
  events: {
    log: struct.json(struct.object({ level: struct.string(), msg: struct.string() })),
  },
})

async function tailLogs() {
  const [error, stream, open] = await client.execute(useLogStream())

  if (error) {
    console.error('Connection failed:', error)
    return
  }

  console.log('Connected', open.url)

  for await (const event of stream) {
    if (typeof event.data === 'object' && event.data !== null) {
      console.log(`[${event.data.level}] ${event.data.msg}`)
    }
  }

  const closeInfo = await stream.closed
  console.log('Stream closed:', closeInfo.code)
}

tailLogs()
```

## Qué sigue

- [Cliente →](/core/client) — `createClient` y opciones `sse`
- [Comandos →](/core/commands) — Definiciones de comandos y reglas de entrada
- [WebSocket →](/core/web-socket) — Conexión WebSocket y gestión de estado

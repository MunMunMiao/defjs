---
title: SSE
description: Use defineEventStream to define typed Server-Sent Events endpoints and consume streaming events through the client.
---

# SSE

Defjs usa `defineEventStream` para definir endpoints SSE (Server-Sent Events) tipados. Tras la ejecución, se devuelve una trípla `[error, stream, openInfo]`, donde `stream` es un iterable asíncrono para consumir eventos enviados por el servidor uno a uno.

## Definir un flujo de eventos

Al definir un endpoint SSE, declara el campo `events` mapeando nombres de eventos a esquemas struct. El campo `data` de cada tipo de evento se parsea automáticamente según el esquema coincidente.

```typescript
import { createClient, defineEventStream, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const useNotifications = defineEventStream({
  path: '/v1/notifications',
  events: {
    message: struct.object({
      id: struct.number(),
      text: struct.string(),
    }),
    heartbeat: struct.string(),
  },
})
```

### Esquema de evento por defecto

Si el servidor puede enviar tipos de evento no declarados explícitamente en `events`, proporciona un esquema `default` como respaldo. Sin `default`, los eventos desconocidos se descartan silenciosamente.

```typescript
const useMixedStream = defineEventStream({
  path: '/v1/events',
  events: {
    userconnect: struct.object({ uid: struct.number() }),
    default: struct.object({ note: struct.string() }),
  },
})
```

### Flujos de eventos con entrada

Cuando un flujo necesita parámetros de consulta o cuerpo de petición, proporciona esquema `input` y función `build`. La firma de `build` es la misma que `defineRequest`, admitiendo params, query y headers.

```typescript
const useRoomStream = defineEventStream({
  path: '/v1/room/:roomId',
  input: struct.object({ roomId: struct.string() }),
  build: ({ roomId }) => ({
    params: { roomId },
  }),
  events: {
    chat: struct.object({ user: struct.string(), text: struct.string() }),
  },
})

const [error, stream, open] = await client.execute(useRoomStream({ roomId: '42' }))
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
  if (event.event === 'message') {
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

Cuando el servidor envía un evento que no puede coincidir con ningún esquema en `events` (o `default`), o la validación del esquema falla, se activa el observador `onInvalidEvent`. Es una configuración a nivel de cliente pasada mediante `sse.onInvalidEvent` en `createClient`.

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    onInvalidEvent: async (context) => {
      console.warn('Invalid event:', context.reason, context.message)
      // context.reason: 'missing-struct' | 'validation-failed'
      // context.message: { id, event, data, retry? }
      // context.cause: Error original cuando la validación falla
    },
  },
})
```

`onInvalidEvent` es un **observador**:

- Incluso si lanza internamente, la excepción se ignora silenciosamente y el flujo continúa.
- No bloquea el consumo de eventos subsecuentes.

## Configuración de reconexión y cola

El transporte SSE tiene reconexión automática integrada, configurable mediante `sse.reconnect` y `sse.queue` a nivel de cliente.

### Configuración de reconexión

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
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
  },
})
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
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    queue: {
      maxSize: 100,
      overflow: 'drop-oldest', // 'drop-newest' | 'drop-oldest' | 'error'
    },
  },
})
```

| `overflow`    | Comportamiento                                                      |
| ------------- | ------------------------------------------------------------------- |
| `drop-newest` | Descarta eventos recién llegados, mantiene eventos antiguos en cola |
| `drop-oldest` | Descarta eventos más antiguos, hace espacio para eventos nuevos     |
| `error`       | Cola llena lanza error, causando cierre del flujo                   |

## Ejemplo completo

```typescript
import { createClient, defineEventStream, struct } from '@defjs/core'

const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    reconnect: { attempts: 5, delayMs: 1000, factor: 2, maxDelayMs: 30000 },
    queue: { maxSize: 100, overflow: 'drop-oldest' },
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
    },
  },
})

const useLogStream = defineEventStream({
  path: '/v1/logs',
  events: {
    log: struct.object({ level: struct.string(), msg: struct.string() }),
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
    console.log(`[${event.data.level}] ${event.data.msg}`)
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

---
title: SSE
description: Define y decodifica Server-Sent Events con límites, configura la reconexión y cierra los streams que abras.
---

# SSE

`defineEventStream(...)` crea un constructor de comandos SSE. Un endpoint declara su ruta y el Struct que se usará para cada nombre de evento.

```typescript
import { defineEventStream, struct } from '@defjs/core'

const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
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

El método por defecto es `GET`. Un endpoint puede declarar otro método, pero el contexto de build SSE de alto nivel no admite un cuerpo de petición.

## Decodificación de eventos

El parser SSE selecciona `events[eventName]` y, si existe, recurre después a `events.default`. Si no encuentra ninguno, descarta el evento y notifica `missing-struct` al observador opcional de eventos no válidos.

Los campos SSE `data:` llegan como texto:

- `struct.string()`, `struct.text()`, `struct.any()` y `struct.unknown()` reciben texto;
- `struct.number()` elimina el espacio de los extremos y acepta un número finito;
- `struct.boolean()` elimina el espacio de los extremos y solo acepta `true` o `false`;
- `struct.json(inner)` parsea el texto como JSON y después lo decodifica estructuralmente con `inner`.

Un `struct.object(...)` sin wrapper no interpreta como JSON el texto de un evento aunque lo parezca. Envuélvelo con `struct.json(...)`.

Un Struct `default` gestiona cualquier otro nombre no declarado:

```typescript
const events = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/events',
  events: {
    update: struct.json(struct.object({ version: struct.number() })),
    default: struct.string(),
  },
})
```

Sin un Struct `default`, `EventStreamData<TEvents>` es una unión discriminada de los nombres de evento declarados. Al discriminar por `event.event`, `event.data` se estrecha a la salida del Struct correspondiente. Cuando `default` está presente, su rama conserva el nombre real recibido del protocolo como `event: string`; por tanto, los streams que combinan eventos conocidos con `default` conservan esa rama amplia de fallback.

## Entrada y mapeo de la petición

Usa `struct.request(...)` para las secciones de ruta, query y cabeceras:

```typescript
const roomEvents = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/rooms/:roomId/events',
  input: struct.request({
    path: struct.object({ roomId: struct.string() }),
    query: struct.object({ after: struct.string().optional() }),
  }),
  events: {
    message: struct.json(struct.object({ text: struct.string() })),
  },
})
```

Un `build` SSE personalizado puede asignar parámetros de ruta, parámetros de query y cabeceras. Recibe una proyección vinculada al esquema. No puede establecer el cuerpo ni las credenciales. Configura las credenciales del cliente mediante `withCredentials(...)`.

## Tupla de arranque

```typescript
const [error, stream, startupOpen] = await client.execute(
  roomEvents({
    path: { roomId: 'general' },
  }),
)
```

Para la ejecución HTTP, SSE y WebSocket, `timeout` debe ser un entero seguro positivo dentro de `1..2_147_483_647`; `0`, los valores negativos o fraccionarios, `NaN`, `Infinity` y los valores superiores al límite devuelven `REQUEST_VALIDATION_FAILED` antes de crear cualquier recurso de request, stream o socket.

SSE devuelve:

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

Cuando el arranque tiene éxito, el tercer elemento es su instantánea de apertura validada. La respuesta ya ha superado las comprobaciones de estado HTTP y de `Content-Type: text/event-stream`.

`stream.open` es un getter actualizado. Conserva la última respuesta que ha visto el stream lógico, incluida la de una reconexión posterior que luego falle al validar el estado o el tipo de contenido. Guarda `startupOpen` aparte si necesitas la instantánea inicial.

No registres por defecto `startupOpen.url`, `stream.open.url` ni URLs de respuesta. Pueden contener datos sensibles en la ruta o la query.

## Consumir eventos

El propietario debe iniciar la iteración y preparar el cierre dentro del mismo ciclo de vida:

```typescript
import type { Client } from '@defjs/core'

declare const client: Client
declare const showNotification: (message: { id: number; text: string }) => void

async function consumeNotifications(signal: AbortSignal) {
  const [error, stream, startupOpen] = await client.execute(notifications(), { signal })

  if (error) {
    console.error('notification stream startup failed', { kind: error.kind, code: error.code })
    return
  }

  console.info('notification stream connected', {
    status: startupOpen.response?.status,
  })

  try {
    for await (const event of stream) {
      switch (event.event) {
        case 'message':
          showNotification(event.data)
          break
        case 'heartbeat':
          break
        default: {
          const exhaustive: never = event
          void exhaustive
        }
      }
    }
  } finally {
    await stream.closed
  }
}
```

Un `execute` correcto significa que ha terminado el arranque. Los errores posteriores aparecen como rechazo del iterador y en `stream.closed`; no cambian el elemento `error` de la tupla original.

Salir antes de un bucle `for await` mediante `break`, `return` o un error lanzado llama a `return()` del iterador. El stream se cierra automáticamente con `{ code: 'aborted', reason: 'iterator-return' }`; esperar `stream.closed` permite observar ese estado final. Llama a `stream.close(...)` de forma explícita solo cuando el propietario deba cerrar el stream desde fuera de una iteración activa.

## Eventos no válidos

Configura `onInvalidEvent` mediante `withSSEOnInvalidEvent(...)` o `withSSEOptions(...)`:

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOnInvalidEvent(({ reason, message, signal }) => {
    if (signal.aborted) return
    recordInvalidEvent({ eventName: message.event, reason })
  }),
)
```

El observador recibe:

- `reason: 'missing-struct' | 'validation-failed'`;
- el `id` sin procesar, el nombre y el texto de datos del evento;
- `cause` cuando falla la validación.
- el `signal` del intento activo.

El evento se descarta, pero uno válido posterior aún puede entregarse. Las excepciones y promesas rechazadas del observador quedan aisladas, mientras que abort interrumpe un observador pendiente mediante `signal`. Hazlo rápido y enmascara `id`, `data` y `cause` antes de registrarlos.

## Reconexión

SSE incorpora reintentos para fallos de red y de lectura del stream. Un EOF normal cierra el stream con `code: 'eof'`; no provoca una reconexión.

Por defecto, el reintento empieza tras 1 segundo y no tiene límite. Define `attempts` para acotarlo:

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEReconnect({
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 250,
  }),
)
```

`attempts` indica el número de reintentos después del intento inicial. `attempts: 0` los desactiva. El valor `attempt` que recibe `shouldReconnect` empieza en 1 para el primer reintento y sigue acumulándose durante todo el stream lógico; una conexión física correcta no lo reinicia.

La espera comienza con el intervalo de reintento actual. El servidor puede actualizarlo mediante un campo SSE `retry:`. `factor` aplica crecimiento exponencial y `maxDelayMs` limita esa base. Después, `jitter` añade un número aleatorio de milisegundos entre cero y el valor configurado. Como se añade después de aplicar el límite, la espera final puede superar `maxDelayMs` en una cantidad menor que `jitter`.

```typescript
withSSEReconnect({
  attempts: 5,
  shouldReconnect({ attempt, lastEventId, cause, open }) {
    return shouldRetryStream({ attempt, lastEventId, cause, status: open?.response.status })
  },
})
```

En los intentos posteriores, el transporte envía el último ID de evento como `Last-Event-ID`. Si `shouldReconnect` lanza o rechaza, se detiene el retry y el arranque o stream pendiente termina con ese error de política. Abort interrumpe un predicado pendiente mediante la señal del intento activo.

Los fallos de validación de HTTP o de apertura, los errores fatales al procesar mensajes y un EOF normal no equivalen a un fallo de red o lectura que se pueda reintentar. No des por hecho que todos los finales provocan reconexión.

## Límites propiedad del endpoint

Un stream admite exactamente un consumidor del iterador asíncrono. Crear un segundo iterador lanza. Devolver el iterador, incluido un `break` temprano de `for await`, cierra automáticamente el stream con el motivo `iterator-return`.

Cada definición exige `maxBufferSize` y `maxQueueSize` como enteros seguros positivos. El primero limita cada línea SSE y los datos del evento actual; el segundo limita los eventos parseados en espera. El desbordamiento es fatal y nunca descarta eventos silenciosamente.

```typescript
const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: { message: struct.json(notificationStruct) },
})
```

Un EOF normal permite vaciar los eventos almacenados. Un error fatal de parser, transformación o desbordamiento borra el buffer, cancela el body activo, rechaza la iteración y resuelve `stream.closed` con `code: 'error'`.

## Cierre definitivo

`stream.closed` se resuelve con una unión discriminada:

```typescript
type EventStreamCloseInfo =
  | { code: 'eof'; reason?: string; cause?: unknown }
  | { code: 'aborted'; reason?: string; cause?: unknown }
  | { code: 'error'; errorCode: EventStreamErrorCode; reason?: string; cause?: unknown }
```

- `eof` indica que el cuerpo de la respuesta terminó con normalidad.
- `aborted` incluye una llamada explícita a `stream.close(...)` o una ruta de cancelación.
- `error` indica que los reintentos se detuvieron o se produjo un error definitivo del stream. Esta rama siempre incluye un `errorCode` público.

`EventStreamErrorCode` tiene seis valores estables:

| Error code                  | Significado                                                                       |
| --------------------------- | --------------------------------------------------------------------------------- |
| `INVALID_RESPONSE`          | El estado, content type, error de respuesta o body era inválido.                  |
| `MESSAGE_PROCESSING_FAILED` | Falló la transformación de un evento o un callback del ciclo de vida.             |
| `PARSER_LIMIT_EXCEEDED`     | Se superó un límite de buffer del parser propiedad del endpoint.                  |
| `QUEUE_OVERFLOW`            | Los eventos parseados superaron el límite de cola del endpoint.                   |
| `TIMEOUT`                   | El intento de transporte alcanzó el timeout configurado.                          |
| `TRANSPORT_ERROR`           | Ocurrió otro fallo definitivo de red, lectura del stream o política de reintento. |

`stream.close(reason)` es idempotente. Cancela el trabajo de transporte activo, cierra la cola para nuevos valores y resuelve `stream.closed`. El `return()` del iterador usa la misma ruta de cierre con el motivo `iterator-return`.

Los logs rutinarios deben registrar solo `close.code` y, en la rama `error`, `close.errorCode`. No registres `reason`, `cause`, eventos sin procesar ni URLs del stream sin una política explícita de redacción y conservación.

La parte de la aplicación que abre el stream es responsable de cerrarlo. Ni el cliente ni un provider de framework lo cierran automáticamente.

## Siguiente paso

- [WebSocket](/es-ES/core/web-socket) cubre las sesiones bidireccionales y la reconexión opcional.
- [Interceptores](/es-ES/core/interceptors) explica cómo cambiar cabeceras SSE y observar el ciclo de vida.
- [Errores](/es-ES/core/errors) describe cuándo hay una respuesta de arranque disponible.

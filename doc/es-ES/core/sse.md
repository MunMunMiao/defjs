---
title: SSE
description: Define y decodifica Server-Sent Events, gestiona el arranque, consume la cola de eventos compartida, configura la reconexión y cierra los streams que abras.
---

# SSE

`defineEventStream(...)` crea un constructor de comandos SSE. Un endpoint declara su ruta y el Struct que se usará para cada nombre de evento.

```typescript
import { defineEventStream, struct } from '@defjs/core'

const notifications = defineEventStream({
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
    stream.close('consumer-finished')
    await stream.closed
  }
}
```

Un `execute` correcto significa que ha terminado el arranque. Los errores posteriores aparecen como rechazo del iterador y en `stream.closed`; no cambian el elemento `error` de la tupla original.

## Eventos no válidos

Configura `onInvalidEvent` mediante `withSSEOnInvalidEvent(...)` o `withSSEOptions(...)`:

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOnInvalidEvent(({ reason, message }) => {
    recordInvalidEvent({ eventName: message.event, reason })
  }),
)
```

El observador recibe:

- `reason: 'missing-struct' | 'validation-failed'`;
- el `id` sin procesar, el nombre, el texto de datos y el valor de retry opcional del evento;
- `cause` cuando falla la validación.

El evento se descarta, pero un evento válido posterior aún puede entregarse. Se capturan las excepciones y promesas rechazadas del observador; sin embargo, un observador asíncrono se espera antes de continuar con mensajes posteriores. Hazlo rápido. Revisa y enmascara los valores sin procesar de `id`, `data` y `cause` antes de registrarlos.

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

En los intentos posteriores, el transporte envía el último ID de evento como `Last-Event-ID`. `shouldReconnect` no debe lanzar. Si el predicado lanza o devuelve una promesa rechazada, actualmente no se garantiza que se resuelvan todos los iteradores pendientes ni todas las rutas de `stream.closed`.

Los fallos de validación de HTTP o de apertura, los errores fatales al procesar mensajes y un EOF normal no equivalen a un fallo de red o lectura que se pueda reintentar. No des por hecho que todos los finales provocan reconexión.

## Cola de trabajo compartida

El iterable asíncrono es una única cola de trabajo compartida por el stream lógico. No es una suscripción, un broadcast ni un mecanismo de backpressure.

Por defecto, la cola no tiene límite. Puedes acotarla con `withSSEQueue(...)` o `withSSEOptions({ queue })`:

```typescript
withSSEQueue({
  maxSize: 100,
  overflow: 'drop-oldest',
})
```

| Desbordamiento | Comportamiento al alcanzar el límite                                 |
| -------------- | -------------------------------------------------------------------- |
| `drop-newest`  | Descarta el evento que acaba de llegar.                              |
| `drop-oldest`  | Elimina el evento almacenado más antiguo y encola el nuevo.          |
| `error`        | Lanza un error de desbordamiento de cola y termina el procesamiento. |

Si hay varios iteradores, compiten por los valores; cada uno no recibe una copia. Salir de un bucle `for await` no cierra el transporte porque el iterador no implementa un `return()` que controle el ciclo de vida. Llama expresamente a `stream.close(...)`.

El cierre marca la cola como terminada para nuevos valores, pero no descarta los que ya estaban almacenados. Un consumidor puede vaciarlos antes de que la siguiente iteración devuelva `done: true`.

### Límite del buffer del parser

La cola de eventos y el buffer del parser son recursos distintos. Proporciona un `maxBufferSize` positivo mediante `withSSEOptions(...)` para limitar los bytes retenidos por una línea SSE incompleta:

```typescript
withSSEOptions({
  maxBufferSize: 64 * 1024,
})
```

Si se supera el límite después del arranque, el iterador se rechaza y el stream se cierra con `code: 'error'`. Si omites el valor, el buffer del parser no tiene límite.

## Cierre definitivo

`stream.closed` se resuelve con:

```typescript
interface EventStreamCloseInfo {
  code: 'eof' | 'aborted' | 'error'
  reason?: string
  cause?: unknown
}
```

- `eof` indica que el cuerpo de la respuesta terminó con normalidad.
- `aborted` incluye una llamada explícita a `stream.close(...)` o una ruta de cancelación.
- `error` indica que los reintentos se detuvieron o se produjo un error definitivo del stream.

`stream.close(reason)` es idempotente. Cancela el trabajo de transporte activo, cierra la cola para nuevos valores y resuelve `stream.closed`. Un `break` no hace ninguna de esas cosas.

La parte de la aplicación que abre el stream es responsable de cerrarlo. Ni el cliente ni un provider de framework lo cierran automáticamente.

## Siguiente paso

- [WebSocket](/es-ES/core/web-socket) cubre las sesiones bidireccionales y la reconexión opcional.
- [Interceptores](/es-ES/core/interceptors) explica cómo cambiar cabeceras SSE y observar el ciclo de vida.
- [Errores](/es-ES/core/errors) describe cuándo hay una respuesta de arranque disponible.

---
title: Server-Sent Events
description: Consume un stream SSE tipado, ciérralo y espera la promesa terminal closed.
---

# Server-Sent Events

Abre un stream, itera una vez, luego `close` y `await stream.closed`. Tú eres dueño de ese ciclo de vida — clientes y plugins no lo disponen por ti.

## Basic Setup

```typescript twoslash
import { createClient, defineEventStream, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: {
    message: struct.json(struct.object({ text: struct.string() })),
  },
})

const [error, openedStream] = await client.execute(notifications())
if (error) {
  console.error(error.code)
} else {
  await using stream = openedStream
  for await (const event of stream) {
    if (event.event === 'message') console.log(event.data.text)
  }
}
```

## Definir el stream

`defineEventStream(...)` necesita `events`, `maxBufferSize` entero seguro positivo, `maxQueueSize` entero seguro positivo y un `path` relativo. El método por defecto es `GET`.

La entrada de la solicitud puede tener `path`, `query` y `headers` — no `body`. Un `build` personalizado solo obtiene setters de path/query/header. Defjs envía `Accept: text/event-stream` cuando no pusiste ya `Accept`.

Un stream lógico puede abarcar varios intentos Fetch físicos. SSE reintenta por defecto fallos transitorios de red y de lectura del stream aunque no haya opciones de reconnect; sin un límite `attempts` esos reintentos son ilimitados. Sigues obteniendo un handle y un iterador async.

## Abrir e inspeccionar

`client.execute(...)` se resuelve solo después de que pasen las comprobaciones de estado, content-type y cuerpo:

```typescript twoslash
import { createClient, defineEventStream, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: { message: struct.string() },
})

const [error, stream, startupOpen] = await client.execute(notifications())
if (error) {
  console.error(error.kind, error.code, startupOpen?.response.status)
} else {
  console.log(stream.open.response.status, startupOpen.response.status, stream.open.url)
  stream.close('example-finished')
  await stream.closed
}
```

La respuesta debe ser exitosa, con esencia de media type `text/event-stream`, y tener cuerpo. Arranque no-2xx → `HTTP_STATUS`. Content type malo o cuerpo ausente → `RESPONSE_VALIDATION_FAILED`. Un snapshot de respuesta aún puede quedar en el tercer slot de la tupla cuando la validación falla después de que llega la respuesta.

`startupOpen` es el snapshot inicial. `stream.open` está en vivo y cambia en opens físicos posteriores. Conserva el valor de la tupla cuando importa la primera respuesta.

```typescript twoslash
import type { EventStreamHandle, EventStreamOpenInfo, RequestError } from '@defjs/core'

type StreamResult<T> =
  | [error: null, stream: EventStreamHandle<T>, open: EventStreamOpenInfo]
  | [error: RequestError, stream: undefined, open: EventStreamOpenInfo | undefined]

const result: StreamResult<string> | undefined = undefined
void result
```

## Decodificar eventos

Nombre de evento en el cable → `events[eventName]`; si no, `events.default`. Sin Struct coincidente → el evento no se entrega. Campo SSE `event` ausente → nombre lógico `message`.

Los `data` SSE empiezan como texto. El Struct seleccionado decide la conversión:

| Struct                                                                 | Conversión                                                                          |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `struct.string()`, `struct.text()`, `struct.any()`, `struct.unknown()` | Se queda texto                                                                      |
| `struct.number()`                                                      | El texto recortado debe ser un número finito; vacío inválido                        |
| `struct.boolean()`                                                     | Texto recortado exactamente `true` o `false`                                        |
| `struct.json(inner)`                                                   | Parsear JSON, luego decodificar con `inner`                                         |
| Object, array, union u otros Structs ordinarios                        | Decodificar el texto directamente; el texto con pinta de JSON **no** se parsea solo |

Valor emitido: `event`, `data` decodificado, `id` opcional no vacío. Con `default`, los nombres de evento desconocidos son `string` en la unión inferida.

## Observar eventos inválidos

Los eventos inválidos/no declarados se descartan, no se encolan. `withSSEOnInvalidEvent(...)` puede observar ID en bruto, nombre, datos de texto, más `missing-struct` o `validation-failed` y un cause opcional.

```ts
import { createClient, withEndpoint, withSSEOnInvalidEvent } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOnInvalidEvent(({ reason, message, cause, signal }) => {
    if (signal.aborted) return
    console.info('Dropped SSE event', {
      reason,
      event: message.event,
      hasCause: cause !== undefined,
    })
  }),
)
```

El observador corre en el límite de transformación. Su fallo queda aislado salvo que el signal del intento activo esté abortado. Manténlo corto; no trates los datos de evento en bruto como de confianza.

## Reconnect

Los ajustes de reconnect personalizan la ruta de retry por defecto — no hacen falta para habilitar reintentos. El EOF normal no se reintenta. Los fallos de red y de lectura del stream sí pueden. La validación de estado/content-type, los límites del parser, los fallos de transformación de mensaje, el overflow de cola y el EOF normal son terminales para el stream lógico.

```ts
import { createClient, withEndpoint, withSSEReconnect } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEReconnect({
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 0.5,
    shouldReconnect({ attempt, open }) {
      return attempt <= 5 && (open?.response.status ?? 0) !== 401
    },
  }),
)
```

`attempts` cuenta reintentos tras el intento inicial; `attempts: 0` desactiva el retry. Sin límite de intentos → reintentos built-in ilimitados. `delayMs` es el intervalo inicial; `factor` lo crece; `maxDelayMs` tapa la base. El `jitter` de SSE es un **factor multiplicativo 0–1**, igual que WebSocket. Un campo `retry:` del stream actualiza el intervalo actual. El callback de política que devuelve false / lanza / rechaza termina el stream lógico.

El último ID de evento parseado se convierte en `Last-Event-ID` en un intento posterior. Conoce la semántica de replay del servidor antes de un reconnect ilimitado.

## Límites de buffer y cola

Ambos deben ser enteros seguros positivos. El overflow es fatal — no hay descarte silencioso de eventos antiguos.

| Límite          | Protege                                                         | Código terminal         |
| --------------- | --------------------------------------------------------------- | ----------------------- |
| `maxBufferSize` | Línea/evento SSE incompleto/sobredimensionado al parsear        | `PARSER_LIMIT_EXCEEDED` |
| `maxQueueSize`  | Eventos producidos más rápido de lo que lee el único consumidor | `QUEUE_OVERFLOW`        |

Un stream fatal también limpia eventos en buffer, cancela el cuerpo activo, rechaza el iterador y resuelve `stream.closed` con `code: 'error'`.

## Cerrar y await

`EventStreamHandle`: un snapshot de apertura en vivo, una promesa terminal, un `close`, un iterador async.

```typescript twoslash
import type { EventStreamCloseInfo, EventStreamHandle, EventStreamOpenInfo } from '@defjs/core'

type StreamApi<T> = {
  readonly open: EventStreamOpenInfo
  readonly closed: Promise<EventStreamCloseInfo>
  close(reason?: unknown): void
  [Symbol.asyncDispose](): PromiseLike<void>
  [Symbol.asyncIterator](): AsyncIterator<T>
}

const handle = null as unknown as EventStreamHandle<string>
const api: StreamApi<string> = handle
void api
```

Códigos terminales: `eof`, `aborted` o `error`. Un resultado `error` también lleva un `EventStreamErrorCode`: `INVALID_RESPONSE`, `MESSAGE_PROCESSING_FAILED`, `PARSER_LIMIT_EXCEEDED`, `QUEUE_OVERFLOW`, `TIMEOUT` o `TRANSPORT_ERROR`.

`close(reason)` aborta el intento activo, cierra la cola, se asienta como `aborted`. Un `break` / `return` / throw del bucle invoca el return del iterador y cierra con `iterator-return`. El código que ejecuta el comando es dueño del cierre.

`await using` invoca ese mismo lifecycle propietario. Garantiza que terminen la lectura y reconexión de Defjs y se libere el reader lock; no que acabe una Promise de `ReadableStream.cancel()` atascada en el proveedor. `close()` y `closed` siguen disponibles. Las implementaciones estructurales propias de `EventStreamHandle` deben añadir el mismo disposer; el código que solo recibe handles Defjs no necesita otra llamada runtime.

El contrato mínimo de libs soportado y verificado en el repositorio es `ES2022`, `ESNext.Disposable`, `DOM` y `DOM.Iterable`, con TypeScript 7 fijado. La combinación es un único baseline; no significa que cada declaración obligue por separado a las cuatro entradas, ni se prometen compiladores antiguos sin probar. Un cliente HTTP normal no es `AsyncDisposable`; gestiona sus solicitudes con timeout o `AbortSignal`.

Mantén credenciales, datos de evento, IDs de evento, causes y URL del stream fuera de los logs rutinarios. `withCredentials(true)` afecta a las cookies Fetch de SSE; no configura auth de WebSocket.

## Recetas relacionadas

- [Consumir un stream SSE](../recipes/consume-sse.md)
- [Cancelar una llamada HTTP](../recipes/cancel-http.md)

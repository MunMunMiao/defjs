---
title: WebSocket
description: Define sobres de mensajes, inicia y observa sesiones activas, consume el trabajo entrante, configura reconexión y heartbeat opcionales, y cierra los recursos que abras.
---

# WebSocket

`defineWebSocket(...)` crea un constructor de comandos para un endpoint WebSocket de mensajes JSON.

```typescript
import { createClient, defineWebSocket, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('wss://api.example.com'))

const chat = defineWebSocket({
  maxIncomingQueueSize: 100,
  maxOutgoingQueueSize: 20,
  path: '/chat',
  incoming: {
    message: struct.object({ userId: struct.number(), text: struct.string() }),
    pong: struct.object({}),
  },
  outgoing: {
    send: struct.object({ text: struct.string() }),
    ping: struct.object({}),
  },
})
```

## Sobre de mensaje

Cada mensaje es un objeto JSON con un `type` que debe ser una cadena no vacía. El tipo selecciona un Struct de `incoming` o `outgoing`.

Si el payload es un objeto, sus campos pueden ir junto a `type`:

```json
{ "type": "message", "userId": 7, "text": "Hello" }
```

Si es un escalar o un array, colócalo en `data`:

```json
{ "type": "count", "data": 3 }
```

`type` y `data` son claves reservadas del sobre. Si el propio payload de objeto contiene un campo `data`, envuelve el payload completo para que el entorno de ejecución no confunda ese campo con el contenido del sobre:

```typescript
const audit = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/audit',
  incoming: {
    entry: struct.object({ data: struct.string(), source: struct.string() }),
  },
  outgoing: {
    write: struct.object({ data: struct.string(), source: struct.string() }),
  },
})

const [auditError, auditSession] = await client.execute(audit())
if (!auditError) {
  auditSession.send({
    type: 'write',
    data: { data: 'reviewed-value', source: 'settings' },
  })
}
```

La forma correspondiente en el protocolo es `{ "type": "write", "data": { "data": "reviewed-value", "source": "settings" } }`.

No declares `type` como un campo normal del payload. La normalización del sobre es responsable de él.

Un Struct opcional `incoming.default` gestiona los tipos de mensaje que no estén declarados. Sin él, los tipos desconocidos se descartan.

## Tupla de arranque

```typescript
const [error, session, startupConnection] = await client.execute(chat())
```

Para la ejecución HTTP, SSE y WebSocket, `timeout` debe ser un entero seguro positivo dentro de `1..2_147_483_647`; `0`, los valores negativos o fraccionarios, `NaN`, `Infinity` y los valores superiores al límite devuelven `REQUEST_VALIDATION_FAILED` antes de crear cualquier recurso de request, stream o socket.

WebSocket devuelve:

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, session: undefined, connection: WebSocketConnectionInfo | undefined]
```

El tercer elemento cuando el arranque tiene éxito es la instantánea inicial con `generation: 1`. Puede contener `url`, `protocol` y `extensions` del primer socket físico.

`session.connection` es un getter actualizado; cada apertura física correcta incrementa `generation`. Conserva el tercer elemento de la tupla si necesitas la instantánea inicial.

No registres las URLs de conexión. Pueden contener identificadores de ruta, datos de query de la aplicación y campos de propagación de telemetría.

## Sesión activa

Un `WebSocketSession` representa una sesión lógica que puede abarcar varios intentos de conexión física.

| Miembro                    | Comportamiento                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `connection`               | Información actual de la última conexión.                                                        |
| `bufferedAmount`           | Bytes no enviados del socket nativo, o `0` si no existe.                                         |
| `state`                    | Estado actual de la sesión lógica.                                                               |
| `receive`                  | Cola de trabajo asíncrona compartida con mensajes entrantes ya validados.                        |
| `send(message)`            | Comprueba escritura, valida, serializa y después envía o encola.                                 |
| `close(code?, reason?)`    | Solicita el cierre definitivo.                                                                   |
| `closed`                   | Promesa con la información de cierre definitivo observada.                                       |
| `onStateChange(listener)`  | Añade un observador de estado y devuelve una función para darlo de baja.                         |
| `onRuntimeError(listener)` | Añade un observador de errores en tiempo de ejecución y devuelve una función para darlo de baja. |

Una vez devuelta, el cliente no registra la sesión. Quien llama es responsable del consumo, los observadores, la cancelación y el cierre.

## Recibir mensajes

Los mensajes de texto, ArrayBuffer, arrays tipados y Blob se decodifican por orden de llegada como JSON UTF-8. Las siguientes entradas se descartan sin notificación:

- un sobre que no sea un objeto;
- un `type` ausente o una cadena vacía;
- un tipo desconocido sin Struct `incoming.default`.

El JSON no válido y los fallos del Struct seleccionado se envían a `onRuntimeError`; el frame se descarta y la sesión continúa.

```typescript
const unsubscribeError = session.onRuntimeError(() => {
  recordSocketFailure({ operation: 'chat-receive' })
})

try {
  for await (const message of session.receive) {
    if (message.type === 'message') {
      renderMessage(message.userId, message.text)
    }
  }
} finally {
  unsubscribeError()
  session.close(1000, 'consumer-finished')
  await session.closed
}
```

`receive` admite exactamente un iterador. `maxIncomingQueueSize` es un límite positivo obligatorio; el desbordamiento vacía el búfer, hace fallar el iterador y termina la sesión como `error`.

## Enviar mensajes

`send(...)` es síncrono. Puede lanzar de forma síncrona cuando:

- el endpoint no tiene un mapa `outgoing`;
- el mensaje no tiene un `type` válido;
- el tipo no está declarado;
- falla la decodificación estructural o la codificación del payload;
- la cola de salida del endpoint está deshabilitada o llena durante `reconnecting`;
- el socket nativo lanza durante un envío inmediato.

```typescript
try {
  session.send({ type: 'send', text: 'Hello' })
} catch (error) {
  handleSendFailure(error)
}
```

La capacidad lógica de escritura se comprueba antes de validar o serializar el payload. Solo se envía directamente cuando el estado lógico y el socket físico actual son `open`. Solo se encola durante `reconnecting` si `maxOutgoingQueueSize` del endpoint es positivo. La FIFO se vacía antes de publicar `open` para el socket de reemplazo.

Durante el cierre manual, tras un estado definitivo y mientras el predicado de reconexión aún no ha decidido un cierre remoto, `send` lanza `InvalidStateError`. El transporte no repite frames ya enviados a un socket físico anterior.

## Estado

`session.state` puede tomar estos valores:

| Estado         | Significado                                                  |
| -------------- | ------------------------------------------------------------ |
| `idle`         | Estado interno inicial antes de comenzar la ejecución.       |
| `connecting`   | Está comenzando el primer intento físico.                    |
| `open`         | El socket físico actual está abierto.                        |
| `reconnecting` | Se está preparando o retrasando un intento físico posterior. |
| `closing`      | El propietario ha solicitado un cierre manual.               |
| `closed`       | Cierre definitivo sin un error normalizado.                  |
| `aborted`      | Cancelación externa definitiva normalizada como `ABORTED`.   |
| `error`        | Otro fallo definitivo.                                       |

`session.state` describe el ciclo de vida lógico, no demuestra que exista un socket nativo. Durante `reconnecting`, `send` utiliza la capacidad de salida definida por el endpoint.

Los fallos de observadores están aislados: un fallo de listener de estado se notifica a los listeners de errores y el fallo de estos se reenvía a `globalThis.reportError` cuando existe. El estado definitivo libera todos los observadores; dales de baja si su propietario termina antes.

### Antes de cada intento

Puedes configurar `beforeConnect` en el cliente o en una ejecución. Se ejecuta antes del constructor nativo tanto en el intento inicial como en cada reconexión:

```typescript
declare const refreshConnectionState: (signal: AbortSignal) => Promise<void>

const [error, session] = await client.execute(chat(), {
  beforeConnect: ({ signal }) => refreshConnectionState(signal),
})
```

El hook recibe `{ attempt, signal }`; `attempt` empieza en `0` y aumenta en las reconexiones. Pasa `signal` al trabajo asíncrono propio. La cancelación y el timeout compiten con el hook, consumen rechazos tardíos e impiden construir un socket desde un resultado tardío. Lanzar o rechazar es un fallo definitivo de transporte.

## La reconexión es opcional

Si no hay un objeto de reconexión, no se intenta reconectar. Configúralo por cliente o por ejecución:

```typescript
const [error, session] = await client.execute(chat(), {
  reconnect: {
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 0.2,
    shouldReconnect({ attempt, code, wasClean }) {
      return !wasClean && code !== 1008 && attempt <= 5
    },
  },
})
```

`attempts` indica el número de reintentos después del intento inicial. Un objeto vacío activa tres reintentos con estos valores por defecto:

| Campo             | Valor por defecto                                   |
| ----------------- | --------------------------------------------------- |
| `attempts`        | `3`                                                 |
| `delayMs`         | `1000`                                              |
| `factor`          | `2`                                                 |
| `maxDelayMs`      | `30000`                                             |
| `jitter`          | `0`                                                 |
| `shouldReconnect` | Devuelve `true` para cualquier resultado de cierre. |

El predicado por defecto reintenta tanto cierres remotos limpios como no limpios. Define un predicado si un cierre limpio debe ser definitivo. `attempt` empieza en 1 para el primer reintento.

La espera base es `min(delayMs * factor ** (attempt - 1), maxDelayMs)`. En WebSocket, el jitter es multiplicativo: un valor como `0.2` selecciona un factor aleatorio entre `0.8` y `1.2`. Esto es distinto del jitter SSE, que añade milisegundos.

`shouldReconnect` es síncrono. Si lanza, la sesión termina como `error`; si devuelve explícitamente `false`, termina como `closed`. La reconexión solo crea un socket físico nuevo y no repite envíos anteriores. Cuando aumente `session.connection.generation`, restaura solo suscripciones aún activas y seguras para repetir, nunca mutaciones.

## Heartbeat

El heartbeat también es opcional:

```typescript
const [error, session] = await client.execute(chat(), {
  heartbeat: {
    intervalMs: 30_000,
    timeoutMs: 10_000,
    message: () => ({ type: 'ping' }),
    isAck: (message) => message.type === 'pong',
  },
  reconnect: { attempts: 3 },
})
```

`message` debe producir un valor válido para el mapa `outgoing` del endpoint. Un mensaje reconocido por `isAck` cancela el timeout del heartbeat y no se añade a `receive`.

Los fallos de serialización, envío, predicado de ack o timeout del heartbeat son fatales. Notifican a los listeners de errores, hacen fallar `receive` y terminan la sesión como `error` sin consultar la política de reconexión.

`intervalMs` y un `timeoutMs` definido deben ser positivos, finitos y como máximo `2_147_483_647`. Mientras haya un deadline de ack activo, los intervalos posteriores no envían otro ping ni reinician el deadline; un ack o el cierre de la sesión lo elimina.

## Colas

Los límites de cola pertenecen a la definición del endpoint. `maxIncomingQueueSize` es un entero seguro positivo obligatorio; el desbordamiento es fatal y descarta los valores almacenados. `maxOutgoingQueueSize` es un entero seguro no negativo opcional, con valor predeterminado `0`; un valor positivo conserva frames FIFO entre intentos y rechaza el desbordamiento sin borrar frames anteriores.

Ambos límites cuentan elementos, no bytes. `session.bufferedAmount` expone por separado los bytes pendientes del socket nativo. `receive` admite exactamente un iterador.

## Responsabilidad del cierre

`session.close(code, reason)` valida primero que el código sea `1000` o `3000..4999` y que el motivo tenga como máximo 123 bytes UTF-8. Una entrada válida pasa a `closing`, solicita el cierre nativo y espera el `CloseEvent` real; el código y motivo observados prevalecen sobre los solicitados.

`session.closed` se resuelve a partir de la información de cierre que observa la implementación:

```typescript
type WebSocketCloseInfo =
  | { kind: 'closed'; code?: number; reason?: string; wasClean?: boolean }
  | { kind: 'aborted'; cause?: unknown; code?: number; reason?: string; wasClean?: boolean }
  | { kind: 'error'; cause: unknown; code?: number; reason?: string; wasClean?: boolean }
```

El cierre manual, un cierre remoto sin causa y una reconexión rechazada explícitamente producen `closed`. La cancelación externa produce `aborted`; timeout y fallos de ejecución producen `error`. Si el cierre nativo lanza, se intenta una sola vez sin argumentos; si ambos lanzan, se resuelve como `error` sin una tercera llamada.

Da de baja los listeners y cierra la sesión en el límite del componente, ruta, trabajo o servicio que la abrió. Desmontar un provider no realiza por sí solo estas tareas.

## Seguridad de URL y autenticación

Las URLs base HTTP se convierten a esquemas WebSocket: `http:` pasa a `ws:` y `https:` a `wss:`. Proporciona valores de placeholder de ruta sin codificar: Core codifica cada segmento exactamente una vez, convierte `%` en `%25` y rechaza vacío, `.` y `..`. Los valores de query utilizan el serializador configurado.

La prioridad de los protocolos es: opción de ejecución, opción del cliente y, por último, definición del endpoint. Un array de protocolos vacío y explícito impide usar valores de menor prioridad.

Las APIs WebSocket del navegador no pueden establecer cabeceras arbitrarias durante el handshake. No uses los parámetros de query como canal genérico de credenciales: las URLs pueden quedar registradas en herramientas del navegador, proxies, logs de acceso y telemetría. Usa TLS (`wss:`) y un diseño de autenticación revisado para el despliegue, como un flujo de cookies same-site adecuado o un ticket de conexión de corta duración.

## Siguiente paso

- [SSE](/es-ES/core/sse) compara el comportamiento de reintentos y colas del stream.
- [Interceptores](/es-ES/core/interceptors) muestra cómo conservar los getters actualizados de una sesión.
- [Errores](/es-ES/core/errors) cubre los fallos de la tupla de arranque.

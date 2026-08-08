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

WebSocket devuelve:

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, session: undefined, connection: WebSocketConnectionInfo | undefined]
```

El tercer elemento cuando el arranque tiene éxito es la instantánea de la conexión inicial. Puede contener `url`, `protocol` y `extensions`, capturados cuando se abrió el primer socket físico.

`session.connection` es un getter actualizado. Una reconexión sustituye el socket físico subyacente y puede cambiar este valor. Conserva el tercer elemento de la tupla si necesitas la instantánea inicial.

No registres las URLs de conexión. Pueden contener identificadores de ruta, datos de query de la aplicación y campos de propagación de telemetría.

## Sesión activa

Un `WebSocketSession` representa una sesión lógica que puede abarcar varios intentos de conexión física.

| Miembro                    | Comportamiento                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `connection`               | Información actual de la última conexión.                                                        |
| `state`                    | Estado actual de la sesión lógica.                                                               |
| `receive`                  | Cola de trabajo asíncrona compartida con mensajes entrantes ya validados.                        |
| `send(message)`            | Valida, serializa y después envía o encola un mensaje saliente.                                  |
| `close(code?, reason?)`    | Solicita el cierre definitivo.                                                                   |
| `closed`                   | Promesa con la información de cierre definitivo observada.                                       |
| `onStateChange(listener)`  | Añade un observador de estado y devuelve una función para darlo de baja.                         |
| `onRuntimeError(listener)` | Añade un observador de errores en tiempo de ejecución y devuelve una función para darlo de baja. |

Una vez devuelta, el cliente no registra la sesión. Quien llama es responsable del consumo, los observadores, la cancelación y el cierre.

## Recibir mensajes

Los mensajes de texto, ArrayBuffer, arrays tipados y Blob se decodifican como JSON UTF-8. Las siguientes entradas se descartan sin notificación:

- JSON no válido;
- un sobre que no sea un objeto;
- un `type` ausente o una cadena vacía;
- un tipo desconocido sin Struct `incoming.default`.

Una vez seleccionado un Struct, los fallos de decodificación se envían a `onRuntimeError` y el mensaje se descarta.

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

El iterable de entrada es una única cola de trabajo compartida sin límite. Si hay varios iteradores, compiten por los mensajes; no son suscripciones independientes. El transporte no frena al servidor cuando crece la cola. Consume siempre los mensajes entrantes o cierra pronto la sesión.

## Enviar mensajes

`send(...)` es síncrono. Puede lanzar de forma síncrona cuando:

- el endpoint no tiene un mapa `outgoing`;
- el mensaje no tiene un `type` válido;
- el tipo no está declarado;
- falla la decodificación estructural o la codificación del payload;
- una cola de envío acotada utiliza `overflow: 'error'`;
- el socket nativo lanza durante un envío inmediato.

```typescript
try {
  session.send({ type: 'send', text: 'Hello' })
} catch (error) {
  handleSendFailure(error)
}
```

Los mensajes enviados antes de la apertura o entre intentos de reconexión entran en la cola de salida. La cola se vacía cuando se abre un socket físico.

No llames a `send` después de un estado definitivo. La implementación actual no ofrece un contrato estable de rechazo después del cierre, y los datos encolados tras el cierre definitivo podrían no enviarse nunca.

## Estado

`session.state` puede tomar estos valores:

| Estado         | Significado                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idle`         | Estado interno inicial antes de comenzar la ejecución.                                                                                                        |
| `connecting`   | Está comenzando el primer intento físico.                                                                                                                     |
| `open`         | Último estado lógico emitido después de abrir un socket físico. Durante la espera de reconexión puede seguir en `open` aunque no exista ningún socket físico. |
| `reconnecting` | Está comenzando un intento físico posterior una vez transcurrida la espera.                                                                                   |
| `closing`      | Se está cerrando por cancelación un socket que estaba conectando o abierto.                                                                                   |
| `closed`       | Cierre definitivo sin un error normalizado.                                                                                                                   |
| `aborted`      | Cancelación externa definitiva normalizada como `ABORTED`.                                                                                                    |
| `error`        | Otro fallo definitivo.                                                                                                                                        |

`reconnecting` no se emite durante la espera. Se emite cuando comienza el intento siguiente, después de esa espera. Trata `session.state` como el último estado de ciclo de vida emitido, no como prueba de que exista un socket nativo en ese momento. Los mensajes enviados durante ese intervalo entran en la cola de salida.

Los listeners de estado se ejecutan directamente. No deben lanzar; dales de baja cuando termine su propietario.

### Antes de cada intento

Puedes configurar `beforeConnect` en el cliente o en una ejecución. Se ejecuta antes del constructor nativo tanto en el intento inicial como en cada reconexión:

```typescript
declare const refreshConnectionState: () => Promise<void>

const [error, session] = await client.execute(chat(), {
  beforeConnect: refreshConnectionState,
})
```

La entrada del comando y la proyección de la petición ya están construidas. El hook no vuelve a ejecutar `build` ni cambia los valores de query vinculados. Úsalo para tareas preparatorias controladas por la aplicación, como actualizar estado que utilice el mecanismo de handshake del entorno. Si lanza o rechaza una promesa, se produce un fallo definitivo de transporte; no se pasa al predicado de reconexión que evalúa el cierre.

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

`shouldReconnect` debe ser síncrono y no lanzar. La reconexión crea un socket físico nuevo dentro de la misma sesión lógica. Las colas de entrada y salida pertenecen a esa sesión lógica.

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

Cuando vence un `timeoutMs` positivo, la implementación emite `Error('WebSocket heartbeat timeout')` a los listeners de errores y solicita al socket nativo el cierre con código `4000` y motivo `heartbeat timeout`. Para reconectar sigue haciendo falta una política de reconexión independiente que permita el cierre resultante.

Mantén `timeoutMs < intervalMs`. La implementación actual no valida esta relación y, si el timeout es igual o superior al intervalo, puede solaparse con temporizadores de heartbeat posteriores.

## Colas

La opción `queue` solo configura los mensajes salientes:

```typescript
const [error, session] = await client.execute(chat(), {
  queue: {
    maxSize: 100,
    overflow: 'drop-oldest',
  },
})
```

La cola de salida no tiene límite por defecto. Cuando se acota, su modo de desbordamiento por defecto es `drop-oldest`; las alternativas son `drop-newest` y `error`. El cierre definitivo vacía esta cola de envío.

La cola de entrada no tiene ninguna opción pública de límite o desbordamiento. Es una cola de trabajo compartida sin límite y no ofrece backpressure. Quien controle el recurso debe consumirla continuamente o cerrar la sesión.

## Responsabilidad del cierre

`session.close(code, reason)` llama al método `close` del socket nativo actual y cancela la sesión lógica con un marcador de cierre manual. Solicita el cierre; no garantiza un handshake correcto, un estado `closing` visible ni que el valor final de `closed` reproduzca exactamente el código y el motivo solicitados.

`session.closed` se resuelve a partir de la información de cierre que observa la implementación:

```typescript
interface WebSocketCloseInfo {
  cause?: unknown
  code?: number
  reason?: string
  wasClean?: boolean
}
```

Una implementación nativa que nunca emita su evento de cierre puede retrasar la resolución. Una cancelación externa puede terminar como `aborted` o `error` según el motivo normalizado, y puede omitir `closing` si la sesión se encuentra entre intentos.

Da de baja los listeners y cierra la sesión en el límite del componente, ruta, trabajo o servicio que la abrió. Desmontar un provider no realiza por sí solo estas tareas.

## Seguridad de URL y autenticación

Las URLs base HTTP se convierten a esquemas WebSocket: `http:` pasa a `ws:` y `https:` a `wss:`. Los placeholders de ruta no se codifican como segmentos. Los valores de query utilizan el serializador configurado.

La prioridad de los protocolos es: opción de ejecución, opción del cliente y, por último, definición del endpoint. Un array de protocolos vacío y explícito impide usar valores de menor prioridad.

Las APIs WebSocket del navegador no pueden establecer cabeceras arbitrarias durante el handshake. No uses los parámetros de query como canal genérico de credenciales: las URLs pueden quedar registradas en herramientas del navegador, proxies, logs de acceso y telemetría. Usa TLS (`wss:`) y un diseño de autenticación revisado para el despliegue, como un flujo de cookies same-site adecuado o un ticket de conexión de corta duración.

## Siguiente paso

- [SSE](/es-ES/core/sse) compara el comportamiento de reintentos y colas del stream.
- [Interceptores](/es-ES/core/interceptors) muestra cómo conservar los getters actualizados de una sesión.
- [Errores](/es-ES/core/errors) cubre los fallos de la tupla de arranque.

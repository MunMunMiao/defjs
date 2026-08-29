---
title: WebSocket
description: Arranca una sesión JSON tipada, recibe y envía envelopes, luego cierra y await closed.
---

# WebSocket

Start → receive → send → close + `await session.closed`. Tú gestionas el unsubscribe y la disposición. Clientes, providers e interceptores no cierran sesiones solos.

## Basic Setup

```typescript twoslash
import { createClient, defineWebSocket, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://chat.example.com'))
const room = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: { message: struct.object({ text: struct.string() }) },
  outgoing: { send: struct.object({ text: struct.string() }) },
})

const [error, openedSession, startupConnection] = await client.execute(room())
if (error) {
  console.error(error.kind, error.code, startupConnection?.generation)
} else {
  await using session = openedSession
  const unsubscribe = session.onRuntimeError((cause) => console.error('runtime', cause))
  try {
    session.send({ type: 'send', text: 'Hello' })
    for await (const message of session.receive) {
      console.log(message.type, message.text)
      break
    }
  } finally {
    unsubscribe()
  }
}
```

## El envelope JSON

`defineWebSocket(...)` describe un endpoint de mensajes JSON. El mapa `incoming` requerido selecciona un Struct por tipo de mensaje; el `outgoing` opcional hace lo mismo para `session.send(...)`. Cada mensaje de cable es un objeto con un `type` string no vacío.

Los campos de payload de objeto se sientan junto a `type`. Los payloads escalares y de array usan el campo `data` del envelope:

```json
{ "type": "message", "userId": 7, "text": "Hello" }
```

```json
{ "type": "count", "data": 3 }
```

El mapa de mensajes controla el payload, no el discriminador del envelope. `incoming.default` acepta nombres de tipo no declarados; sin él, los tipos desconocidos se descartan. Frames entrantes de texto, `ArrayBuffer`, typed-array y `Blob` se decodifican como JSON UTF-8. JSON malformado y fallos Struct van a los observadores de runtime-error — no a `receive`.

Si un payload de objeto tiene un campo llamado `data`, se queda junto a `type` tras la codificación (no un envelope anidado). Ejemplo: `write` con `{ data: string, source: string }` va por cable como `{ type: 'write', data: string, source: string }`. El valor del lado del llamador sigue siendo `{ type: 'write', data: { data, source } }` porque `data` lleva el payload de objeto antes de la serialización. Los alias se aplican a campos del payload. El discriminador `type` pertenece al envelope, no al Struct.

`session.send(...)` valida y serializa de forma síncrona. Envía de inmediato cuando está open, encola durante `reconnecting` cuando hay cola outgoing habilitada, lanza `InvalidStateError` cuando no es escribible. También lanza cuando no hay mapa outgoing, tipo no declarado, fallo de validación del payload, cola outgoing deshabilitada/llena o fallo nativo de send.

`receive` es de un solo consumidor. Un segundo iterador se rechaza.

## Snapshots de estado

| Miembro                    | Significado                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `state`                    | `idle`, `connecting`, `open`, `reconnecting`, `closing`, `closed`, `aborted` o `error`               |
| `connection`               | Última conexión física: `generation`, URL, protocolo negociado, extensiones cuando están disponibles |
| `bufferedAmount`           | Conteo nativo de bytes no enviados, o `0` sin socket físico                                          |
| `receive`                  | Iterable async de un solo consumidor de mensajes entrantes validados                                 |
| `onStateChange(listener)`  | Suscribirse a transiciones de estado lógico; devuelve unsubscribe                                    |
| `onRuntimeError(listener)` | Suscribirse a errores de runtime no de arranque; devuelve unsubscribe                                |
| `closed`                   | Promesa del resultado de cierre terminal lógico                                                      |

`open` = socket físico abierto. `reconnecting` incluye preparación + delay antes de un reemplazo. `connection.generation` incrementa con cada socket físico que llega a `open`. La tupla `startupConnection` se queda en el primer snapshot con éxito; `session.connection` avanza.

Fallo de arranque → `[error, undefined, connection?]`. Un fallo del constructor pre-open puede no tener conexión; timeout/cierre durante el arranque aún puede proporcionar un snapshot. Tras devolver la sesión, los errores de runtime viajan por observadores, `receive` y `closed` — no por una segunda tupla de execute.

```typescript twoslash
import type { RequestError, WebSocketConnectionInfo, WebSocketSession } from '@defjs/core'

type SocketResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError, session: undefined, connection: WebSocketConnectionInfo | undefined]

const result: SocketResult<unknown, never> | undefined = undefined
void result
```

## Reconnect

El reconnect es opt-in. Sin objeto `reconnect` → el cierre físico termina la sesión lógica. Cuando está configurado, los defaults son `attempts: 3`, `delayMs: 1000`, `factor: 2`, `maxDelayMs: 30000`, `jitter: 0`. `attempts` cuenta reintentos tras el intento inicial; `attempts: 0` desactiva. El predicado por defecto acepta todo resultado de cierre.

```ts
import { createClient, defineWebSocket, struct, withEndpoint, withWebSocketReconnect } from '@defjs/core'

const client = createClient(
  withEndpoint('https://chat.example.com'),
  withWebSocketReconnect({
    attempts: 3,
    delayMs: 500,
    factor: 2,
    maxDelayMs: 10_000,
    jitter: 0.2,
    shouldReconnect({ attempt, code, wasClean }) {
      return attempt <= 3 && (wasClean !== true || code === 1006)
    },
  }),
)
const room = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: { ready: struct.object({ ok: struct.boolean() }) },
})
const [error, session] = await client.execute(room())
if (!error) {
  console.log(session.state)
  session.close(1000, 'done')
}
```

`shouldReconnect` recibe el siguiente intento de retry, cause de cierre, code, reason y `wasClean`. Un `session.close(...)` manual no entra en el predicado. Lanzar en preparación/política termina la sesión lógica con error.

El jitter de backoff de WebSocket es **multiplicativo** (`jitter: 0.2` → delay entre `0.8x` y `1.2x`). El jitter de SSE es un factor multiplicativo 0–1, igual que WebSocket. Los valores de delay/factor/jitter/attempt se validan antes del constructor; los delays del timer no pueden superar `2_147_483_647` ms.

`beforeConnect({ attempt, signal })` corre antes del constructor inicial y de cada reconnect. Pasa su signal al refresh de token para que cancel detenga tanto la prep como el connect.

## Heartbeat

Opt-in en execute o en el ámbito del cliente. El intervalo envía `message()` a través del mapa Struct outgoing. Un `isAck(message)` opcional reconoce un ack — ese mensaje limpia el timeout y **no** se entrega a `receive`.

```ts
import { createClient, defineWebSocket, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://chat.example.com'))
const room = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: { pong: struct.object({ ok: struct.boolean() }) },
  outgoing: { ping: struct.object({}) },
})

const [error, session] = await client.execute(room(), {
  heartbeat: {
    intervalMs: 30_000,
    timeoutMs: 10_000,
    message: () => ({ type: 'ping' }),
    isAck: (message) => message.type === 'pong',
  },
})
if (!error) {
  console.log(session.state)
  session.close(1000, 'done')
}
```

`intervalMs` y `timeoutMs` deben ser timers finitos positivos ≤ `2_147_483_647`. El mensaje de heartbeat debe ser válido para el mapa outgoing. Fallos de serialización, send nativo, clasificación de ack y timeout son fatales para la sesión lógica — no se convierten en reconnects ordinarios.

## Colas

| Ajuste                 | Valor requerido                                 | Comportamiento                                                                                                       |
| ---------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `maxIncomingQueueSize` | Entero seguro positivo                          | Acota mensajes parseados esperando `receive` y frames en bruto esperando transformación. Overflow → `state: 'error'` |
| `maxOutgoingQueueSize` | Entero seguro no negativo opcional; default `0` | FIFO solo mientras `state === 'reconnecting'`. Llena/deshabilitada → `send(...)` lanza                               |

Los frames outgoing encolados se vacían antes de que el socket de reemplazo publique `open`. Los frames ya enviados en un socket anterior nunca se reenvían solos. Las colas de reconnect son para mensajes que envías mientras reconectas — no para reconstruir el estado de la app.

El overflow entrante limpia la secuencia pendiente, falla `receive`, detiene la sesión, resuelve `session.closed` con `kind: 'error'`. Mantén el consumidor lo bastante rápido o sube el tope desde tamaño/memoria medidos.

## Protocolos y autenticación

`protocols` de la definición, `withWebSocketProtocols(...)` del cliente y `protocols` de execute fijan la lista de subprotocolos del constructor. Precedencia: ejecución → cliente → definición. La primera lista definida se copia para la sesión lógica y se reutiliza en reconnect.

Los constructores WebSocket del navegador no aceptan cabeceras arbitrarias de handshake. Defjs convierte `http:` → `ws:` y `https:` → `wss:`, codifica placeholders de path una vez, usa el serializador de query configurado. La construcción de query WebSocket también serializa valores de query complejos como JSON (a diferencia del query HTTP por defecto solo-escalares).

`withCredentials(true)` son credenciales Fetch para HTTP/SSE — no auth de WebSocket. Usa política revisada de cookie/sesión, subprotocolo o un ticket de conexión de corta duración. No pongas credenciales generales ni secretos de larga duración en el query string.

## Cierre y ownership

`session.close(code?, reason?)` pide cierre terminal y detiene el heartbeat. El code debe ser `1000` o `3000..4999`; reason ≤ 123 bytes UTF-8. Args de cierre inválidos lanzan antes de cambiar el estado.

`await using` solicita el cierre y espera el teardown propiedad de Defjs. `close()` y `closed` siguen disponibles cuando necesitas un motivo manual o el resultado terminal lógico.

`kind` terminal: `'closed'`, `'aborted'` o `'error'`, con `code` / `reason` / `wasClean` nativos opcionales y un `cause` para aborted/error. `closed` describe el final lógico y no demuestra el cierre TCP físico. El disposer limita el teardown a un segundo; si falta el evento close, completa el cleanup de Defjs y puede rechazar con una `DOMException` llamada `TimeoutError`, mientras `closed` conserva el resultado manual lógico. Los campos de cierre nativo observados ganan sobre el fallback pedido por el dueño.

## Límite GraphQL

Defjs aporta un envelope JSON tipado y un ciclo de vida de sesión lógica. **No** implementa un protocolo de aplicación WebSocket. Las features GraphQL-over-WebSocket — connection init, IDs de operación, `next`/`error`/`complete`, disposición, replay de suscripción — quedan fuera del contrato core.

Usa un cliente de protocolo como `graphql-ws` cuando el servidor exija ese protocolo, o modela tu propio envelope con `defineWebSocket(...)`. Un mapa de mensajes solo no negocia la semántica GraphQL.

## Recetas relacionadas

- [Abrir una sesión WebSocket](../recipes/websocket-session.md)
- [Consumir un stream SSE](../recipes/consume-sse.md)

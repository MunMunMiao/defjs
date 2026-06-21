---
title: WebSocket
description: Typed WebSocket endpoints with struct-driven messages, automatic reconnect, heartbeat, and send queueing.
---

# WebSocket

`@defjs/core` proporciona endpoints WebSocket tipados mediante `defineWebSocket`. Cada endpoint declara:

- Esquemas `incoming` — mensajes que el servidor envía al cliente.
- Esquemas `outgoing` — mensajes que el cliente envía al servidor.
- Esquema `input` + handler `build` — parámetros de petición y construcción de query/path (opcional).

Los mensajes son codificados en JSON y validados en runtime contra los esquemas declarados.

## Definir un endpoint WebSocket

Usa `defineWebSocket` para crear un constructor de comandos tipado. El constructor se ejecuta luego con `client.execute()`.

```typescript
import { createClient, defineWebSocket, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const useChatSocket = defineWebSocket({
  // Opcional: construir la URL de conexión desde entrada
  input: struct.request({
    query: struct.object({ roomId: struct.string() }),
  }),
  build: (request, input) => {
    request.setQueryParams({ roomId: input.query.roomId })
  },

  // Mensajes de servidor → cliente
  incoming: {
    joined: struct.object({ roomId: struct.string(), userId: struct.number() }),
    message: struct.object({ text: struct.string(), userId: struct.number() }),
  },

  // Mensajes de cliente → servidor
  outgoing: {
    message: struct.object({ text: struct.string() }),
  },

  path: '/ws/chat',
  protocols: ['json'],
})
```

### Formas de esquema

Los mensajes **incoming** se clavean por `type`. Cuando llega un mensaje, su campo JSON `type` se empareja contra las claves de esquema. Si el payload es un objeto plano, sus campos se fusionan con `type`:

```typescript
// Servidor envía: { "type": "message", "text": "hi", "userId": 1 }
// Cliente recibe: { type: 'message', text: 'hi', userId: 1 }
```

Si el payload es escalar o matriz, se envuelve bajo `data`:

```typescript
// Servidor envía: { "type": "notification", "data": [1, 2, 3] }
// Cliente recibe: { type: 'notification', data: [1, 2, 3] }
```

Los mensajes **outgoing** siguen la misma convención. El método `send()` acepta un mensaje con un `type` coincidente con una de las claves de `outgoing`:

```typescript
socket.send({ type: 'message', text: 'hello' })
```

Una clave `default` especial puede usarse en `incoming` para capturar tipos de mensaje no declarados con un esquema compartido.

## Ejecutar y consumir mensajes

`client.execute()` devuelve una tupla `[error, socket, connection]`:

```typescript
const [error, socket, connection] = await client.execute(useChatSocket({ query: { roomId: 'room-1' } }))

if (error || !socket) {
  // manejar fallo de arranque (validación, transporte, aborto, etc.)
  return
}

// Iterar mensajes entrantes
for await (const message of socket.receive) {
  switch (message.type) {
    case 'joined':
      console.log('User joined:', message.userId)
      break
    case 'message':
      console.log('New message:', message.text)
      break
  }
}

// O usar el iterador asíncrono directamente
const iterator = socket.receive[Symbol.asyncIterator]()
const next = await iterator.next()
if (!next.done) {
  console.log(next.value)
}
```

## API de `WebSocketSession`

| Miembro                    | Tipo                                       | Descripción                                                                      |
| -------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------- |
| `connection`               | `WebSocketConnectionInfo`                  | `{ url?, protocol?, extensions? }` del socket subyacente.                        |
| `state`                    | `WebSocketState`                           | Estado actual del ciclo de vida (ver abajo).                                     |
| `receive`                  | `AsyncIterable<TIncoming>`                 | Iterador asíncrono de mensajes entrantes validados.                              |
| `closed`                   | `Promise<WebSocketCloseInfo>`              | Se resuelve cuando el socket cierra con `{ code?, reason?, wasClean?, cause? }`. |
| `send(message)`            | `(message: TOutgoing) => void`             | Envía un mensaje outgoing. Encolado si aún no está abierto.                      |
| `close(code?, reason?)`    | `(code?: number, reason?: string) => void` | Cierra la conexión gracefulmente.                                                |
| `onStateChange(listener)`  | `(state: WebSocketState) => void`          | Devuelve una función de desuscripción.                                           |
| `onRuntimeError(listener)` | `(error: unknown) => void`                 | Devuelve una función de desuscripción.                                           |

```typescript
// Monitorización de estado
const unsubscribe = socket.onStateChange((state) => {
  console.log('Socket state:', state)
})

// Errores de runtime (fallos de esquema, tiempo de espera de latido, etc.)
socket.onRuntimeError((error) => {
  console.error('Runtime error:', error)
})

// Cierre graceful
socket.close(1000, 'done')
await socket.closed
```

## Máquina de estados del ciclo de vida de conexión

```
idle → connecting → open → closing → closed
            ↓           ↓
         reconnecting   error
            ↓           ↓
         (retry)      aborted
```

| Estado         | Significado                                                                            |
| -------------- | -------------------------------------------------------------------------------------- |
| `idle`         | Antes de que se llame `execute()`.                                                     |
| `connecting`   | Abriendo el primer intento de conexión.                                                |
| `open`         | Conexión establecida, los mensajes pueden fluir.                                       |
| `closing`      | `close()` o `abort` fue activado, esperando el evento de cierre.                       |
| `closed`       | Cierre limpio (sin error, o cierre manual).                                            |
| `reconnecting` | Conexión caída, esperando antes de reintentar.                                         |
| `error`        | Fallo terminal (error de validación, error de transporte, cierre no-aborto con causa). |
| `aborted`      | Abortado explícitamente mediante `AbortSignal` o `close()`.                            |

Las transiciones de estado se emiten mediante `onStateChange`. El iterador `receive` asíncrono termina cuando el socket alcanza un estado terminal (`closed`, `error` o `aborted`).

## Latido

Configura ping/ack periódico para mantener la conexión viva o detectar peers muertos.

```typescript
const [error, socket] = await client.execute(useSocket(), {
  heartbeat: {
    intervalMs: 30_000, // enviar cada 30s
    message: () => ({ type: 'ping' }),
    timeoutMs: 10_000, // esperar ack dentro de 10s
    isAck: (message) => message.type === 'pong',
  },
})
```

| Opción       | Descripción                                                                              |
| ------------ | ---------------------------------------------------------------------------------------- |
| `intervalMs` | Intervalo entre envíos de latido (requerido).                                            |
| `message`    | Fábrica que devuelve el mensaje de latido. Tipado contra `TOutgoing`.                    |
| `timeoutMs`  | Si está establecido, el socket se cierra con código `4000` cuando no llega ack a tiempo. |
| `isAck`      | Predicado para reconocer un mensaje entrante como ack de latido.                         |

El latido puede configurarse por cliente (mediante `createClient({ webSocket: { heartbeat: ... } })`) o por petición (mediante opciones de `execute()`). La configuración a nivel de petición gana.

## Reconexión

La reconexión automática se activa cuando la conexión cae inesperadamente.

```typescript
const [error, socket] = await client.execute(useSocket(), {
  reconnect: {
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 0.2,
    shouldReconnect: ({ attempt, code, reason, wasClean }) => {
      return !wasClean && attempt < 3
    },
  },
})
```

| Opción            | Por defecto  | Descripción                                                      |
| ----------------- | ------------ | ---------------------------------------------------------------- |
| `attempts`        | `3`          | Máximo de intentos de reintento. `<= 0` desactiva la reconexión. |
| `delayMs`         | `1000`       | Retardo base antes del primer reintento.                         |
| `factor`          | `2`          | Multiplicador de backoff exponencial.                            |
| `maxDelayMs`      | `30000`      | Tope en el retardo calculado.                                    |
| `jitter`          | `0`          | Factor de aleatorización (`0`–`1`).                              |
| `shouldReconnect` | `() => true` | Predicado para decidir si un cierre dado debe activar reintento. |

Fórmula de retardo: `min(delayMs * factor^(attempt - 1), maxDelayMs)`, luego con jitter.

La reconexión también es configurable a nivel de cliente mediante `createClient({ webSocket: { reconnect: ... } })`.

## Cola de envío

Los mensajes enviados antes de que el socket esté `open` (o durante una desconexión transitoria) se encolan y se vacían una vez que la conexión está lista.

```typescript
const [error, socket] = await client.execute(useSocket(), {
  queue: {
    maxSize: 100,
    overflow: 'drop-oldest', // 'drop-newest' | 'drop-oldest' | 'error'
  },
})
```

| Opción     | Descripción                                           |
| ---------- | ----------------------------------------------------- |
| `maxSize`  | Máximo de mensajes encolados. Por defecto sin límite. |
| `overflow` | Comportamiento cuando se excede `maxSize`.            |

La cola se limpia en cierre terminal (`error`, `aborted`, `closed`).

## Comportamiento de cierre manual y aborto

### `socket.close(code?, reason?)`

Realiza un cierre graceful:

1. Llama al `WebSocket.close(code, reason)` nativo.
2. Aborta el `AbortController` interno con una razón `manual-web-socket-close`.
3. El socket transita por `closing` → `closed`.
4. `socket.closed` se resuelve con el `code` y `reason` proporcionados.

### `AbortSignal` (externo)

Pasa un `AbortSignal` externo mediante las opciones de `execute()`:

```typescript
const controller = new AbortController()
const promise = client.execute(useSocket(), { signal: controller.signal })

// Más tarde:
controller.abort() // cierra inmediatamente el socket y transita a 'aborted'
```

Cuando se aborta **antes** de que el socket se abra, `execute()` se resuelve con un error de transporte y `socket` es `undefined`. Cuando se aborta **después** de abrir, el socket transita a `aborted` y `receive` termina.

### `timeout`

El tiempo de espera a nivel de petición está soportado, pero no puede combinarse con `abort` en la misma petición (se devuelve un error de definición):

```typescript
// OK
client.execute(useSocket(), { timeout: 10_000 })

// Error — no se puede mezclar abort y timeout
client.execute(useSocket(), { abort: signal, timeout: 10_000 })
```

## Ejemplo completo

```typescript
import { createClient, defineWebSocket, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const useSocket = defineWebSocket({
  input: struct.request({
    query: struct.object({ token: struct.string() }),
  }),
  build: (request, input) => {
    request.setQueryParams({ token: input.query.token })
  },
  incoming: {
    status: struct.object({ online: struct.boolean() }),
    alert: struct.object({ level: struct.string(), message: struct.string() }),
  },
  outgoing: {
    subscribe: struct.object({ channel: struct.string() }),
    ping: struct.object({}),
  },
  path: '/ws/live',
})

async function run(token: string) {
  const [error, socket] = await client.execute(useSocket({ query: { token } }), {
    heartbeat: {
      intervalMs: 30_000,
      message: () => ({ type: 'ping' }),
    },
    reconnect: {
      attempts: 5,
      delayMs: 1_000,
      factor: 2,
    },
  })

  if (error || !socket) {
    console.error('Failed to connect:', error)
    return
  }

  socket.onStateChange((state) => console.log('State:', state))
  socket.onRuntimeError((err) => console.error('Error:', err))

  socket.send({ type: 'subscribe', channel: 'news' })

  for await (const msg of socket.receive) {
    if (msg.type === 'status') {
      console.log('Online:', msg.online)
    } else if (msg.type === 'alert') {
      console.warn('Alert:', msg.level, msg.message)
    }
  }

  await socket.closed
  console.log('Socket closed')
}
```

## Qué sigue

- [SSE →](/core/sse) — Server-Sent Events con esquemas tipados y reconexión.
- [Cliente →](/core/client) — Creación de cliente y configuración WebSocket.
- [Comandos →](/core/commands) — Reglas de entrada y build de `defineWebSocket`.

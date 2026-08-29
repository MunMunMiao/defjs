---
title: Defjs
description: Comandos tipados de HTTP, SSE y WebSocket con un cliente explícito y resultados error-first.
---

# Defjs

Define un endpoint, construye un comando opaco y ejecútalo. Misma forma para HTTP, SSE y WebSocket.

```ts get-health.ts
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const getHealth = defineRequest({
  method: 'GET',
  path: '/health',
  output: { 200: struct.object({ ok: struct.boolean() }) },
})

const [error, result, response] = await client.execute(getHealth())
if (!error) console.log(result.ok, response.status)
```

Defjs no cachea resultados, no reintenta por ti ni cierra streams si te olvidas. La cancelación y la limpieza son tuyas.

## Elige un transporte

| Necesitas                                      | Empieza por                       | Resultado correcto                             |
| ---------------------------------------------- | --------------------------------- | ---------------------------------------------- |
| Solicitud + respuesta por estado               | [HTTP](./core/http.md)            | Datos decodificados + `HttpResponse`           |
| Feed de eventos del servidor de larga duración | [SSE](./core/sse.md)              | Un stream + snapshot de arranque `open`        |
| Sesión bidireccional                           | [WebSocket](./core/web-socket.md) | Una sesión + snapshot de arranque `connection` |

¿Nuevo aquí? Haz [Primeros pasos](./guide/getting-started.md) y luego coge una [receta](./recipes/get-declared-404.md). ¿Quieres el «porqué»? Lee [Decisiones de diseño](./guide/design-decisions.md) cuando ya hayas ejecutado algo.

## Elige un paquete

| Paquete                       | Cuándo                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `@defjs/core`                 | `createClient` (HTTP + SSE + WebSocket)                                                  |
| `@defjs/react`                | `ClientProvider` / `useClient` — ver [React](./plugins/react.md)                         |
| `@defjs/vue`                  | Plugin + `injectClient` — ver [Vue](./plugins/vue.md)                                    |
| `@defjs/opentelemetry-server` | Spans/métricas salientes — ver [OpenTelemetry Server](./plugins/opentelemetry-server.md) |

## Formas del resultado

Los tres transportes devuelven una tupla de tres elementos con el error primero. Las posiciones coinciden; los significados no:

- HTTP → `[error, data, response]`
- SSE → `[error, stream, open]`
- WebSocket → `[error, session, connection]`

Si el arranque falla, el segundo elemento es `undefined`. El tercero solo existe cuando ese transporte produjo antes una respuesta o un snapshot. Ver [Errores](./core/errors.md).

## Responsabilidad en una frase

Aborta HTTP cuando ya no sirve. Cierra SSE y `await stream.closed`. Cierra WebSocket y `await session.closed`. En un servidor, crea el cliente dentro del límite de la solicitud cuando las opciones capturan cookies, auth o datos de tenant. Redacta URL, cabeceras y cuerpos antes de registrarlos.

## Recetas relacionadas

- [GET con un 404 declarado](./recipes/get-declared-404.md)
- [POST JSON](./recipes/post-json.md)
- [Cancelar una llamada HTTP](./recipes/cancel-http.md)
- [Consumir un stream SSE](./recipes/consume-sse.md)
- [Abrir una sesión WebSocket](./recipes/websocket-session.md)
- [Probar con un handle Fetch local](./recipes/test-with-handle.md)

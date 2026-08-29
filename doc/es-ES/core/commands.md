---
title: Comandos
description: Define endpoints, construye comandos opacos, mapea entradas e infiere resultados de transporte.
---

# Comandos

Una definición → builder → comando opaco → `client.execute`. El mismo pipeline para HTTP, SSE y WebSocket.

## Basic Setup

```typescript twoslash
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const health = defineRequest({ method: 'GET', path: '/health' })
const [error, data, response] = await client.execute(health())
if (!error) console.log(data, response.status)
```

## Elige una definición

| Definición               | Contrato                                                          | Valor en éxito                           |
| ------------------------ | ----------------------------------------------------------------- | ---------------------------------------- |
| `defineRequest(...)`     | Método, path relativo, input opcional, output por estado opcional | Datos decodificados + `HttpResponse`     |
| `defineEventStream(...)` | Path, límites de buffer/cola, mapa nombre de evento → Struct      | `EventStreamHandle` + snapshot open      |
| `defineWebSocket(...)`   | Path, mapa incoming, mapa outgoing opcional, límite de cola       | `WebSocketSession` + snapshot connection |

Sin `input` → el builder no toma argumento. Con `input` → pasa el valor Struct aunque todos los campos anidados sean opcionales. Las secciones opcionales `path` / `query` / `headers` pueden omitirse; una sección con un campo requerido no. Un wrapper de cuerpo presente significa que el cuerpo es requerido.

Mantén los comandos opacos. No husmees tags ni símbolos.

## Mapeo automático de solicitud

Usa `struct.request(...)` cuando la entrada lógica ya tiene path / query / headers / body:

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const createUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.request({
    body: struct.json(struct.object({ name: struct.string() })),
  }),
  output: { 201: struct.object({ id: struct.number(), name: struct.string() }) },
})
void createUser
```

Los alias reescriben solo las claves de cable salientes. Los valores parseados y las entradas del comando conservan los nombres lógicos.

## `build` personalizado

Llega a `build(request, input)` cuando la forma del llamador y la del cable difieren. Es una proyección acotada — no un sitio para ramificar por política de auth o inventar side effects.

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const search = defineRequest({
  method: 'GET',
  path: '/search',
  input: struct.object({ q: struct.string(), page: struct.number().optional() }),
  build(request, input) {
    request.withQuery({ q: input.q, page: input.page ?? 1 })
  },
  output: { 200: struct.object({ items: struct.array(struct.string()) }) },
})
void search
```

## Formas de output por estado

`output` puede ser un mapa estado → Struct o un `{ status, body }[]`. Gana el estado exacto. Entradas de array: un match posterior anula un match agrupado anterior. Sin declaración coincidente → `UNDECLARED_STATUS` antes de decodificar el cuerpo.

## Recetas relacionadas

- [GET con un 404 declarado](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)

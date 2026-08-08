---
title: Primeros pasos
description: Instala Defjs, define un endpoint HTTP tipado, crea un cliente y úsalo desde tu aplicación.
---

# Primeros pasos

Defjs permite que tu aplicación describa una vez el contrato de una API y lo reutilice con entradas tipadas, decodificación en tiempo de ejecución y resultados de transporte explícitos.

## Instalación

Añade el paquete Core a tu aplicación:

```sh
pnpm add @defjs/core
```

Utiliza el comando equivalente de npm, Yarn o Bun si tu proyecto usa otro gestor de paquetes. `@defjs/core` es ESM. Al ejecutarlo en Node.js, los metadatos actuales del paquete requieren Node 26 o posterior.

Añade un adaptador solo cuando tu aplicación lo necesite:

| Configuración             | Paquetes                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| React 18+                 | `@defjs/core`, `@defjs/react`, `react`                                                    |
| Vue 3+                    | `@defjs/core`, `@defjs/vue`, `vue`                                                        |
| OpenTelemetry en servidor | `@defjs/core`, `@defjs/opentelemetry-server`, `@opentelemetry/api`, `@opentelemetry/core` |

::: tip Usa la documentación de la versión instalada
Estas páginas describen la API de esta versión de la documentación. Comprueba qué versión tiene instalada tu aplicación. Si cambia un export o una opción, consulta la documentación y las notas de esa versión en lugar de mezclar ejemplos de versiones distintas.
:::

## Define tu primera petición

Supón que tu API expone `GET /users/:id`. Sustituye la URL base y los Structs de respuesta por el contrato real de tu servicio.

```typescript
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})

async function loadUser(id: number) {
  const [error, user, response] = await client.execute(getUser({ path: { id } }))

  if (error) {
    console.error(error.kind, error.code)
    return
  }

  console.log(user.name, response.status)
}

void loadUser(7)
```

`defineRequest(...)` devuelve un **constructor de comandos**. Al llamar a `getUser(...)`, creas un **comando** que conserva la definición del endpoint y la entrada de esa llamada. Después, `client.execute(...)` devuelve una tupla HTTP de tres elementos:

```typescript
;[error, result, response]
```

Si todo va bien, `error` es `null`, `result` contiene los datos de salida decodificados y `response` es un wrapper `SettledResponse` de Defjs. Si hay un error, `result` es `undefined`; el wrapper de respuesta también será `undefined` si no se recibió ninguna respuesta.

### Por qué importa `as const`

Cuando `output` es un array, sus literales de estado separan los cuerpos correctos 2xx de los cuerpos de error no 2xx. `as const` conserva esos estados y los arrays agrupados de estados como literales de solo lectura. Sin él, TypeScript puede ampliarlos a `number` o `number[]`, lo que debilita los tipos inferidos para las ramas de éxito y error.

También puedes declarar la salida como un objeto:

```typescript
const output = {
  '200': struct.object({ id: struct.number() }),
  '404': struct.object({ message: struct.string() }),
}
```

## Llévalo a tu aplicación

Guarda las definiciones de endpoints en módulos que describan la API de tu servicio. Reutiliza sus constructores de comandos desde componentes, route handlers, jobs o stores. Crea el cliente en el límite que controla endpoint, credenciales, interceptores y ciclo de vida:

- Una aplicación de navegador normalmente puede compartir un cliente.
- En renderizado de servidor, crea un cliente por petición cuando cambien cabeceras, cookies, usuarios o tenants.
- El código que abre recursos SSE o WebSocket también debe consumirlos y cerrarlos.

## Siguientes pasos

- [Comandos](/es-ES/core/commands) explica el mapeo automático de peticiones y las proyecciones personalizadas vinculadas al esquema.
- [Errores](/es-ES/core/errors) documenta las tuplas de los tres transportes y la unión `RequestError`.
- [HTTP](/es-ES/core/http) cubre la resolución de URLs, los cuerpos de petición, la decodificación de la salida, la cancelación y el comportamiento XSRF.
- [Ejemplos](/es-ES/guide/examples) combina estos contratos en recetas cuyos recursos controla la aplicación.

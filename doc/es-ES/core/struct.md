---
title: Struct
description: Describe la decodificación estructural, los valores cero, la entrada parcial de objetos, los alias y la gestión de StructError.
---

# Struct

Los Structs describen la decodificación estructural y la codificación para el protocolo. Parte de su comportamiento con valores cero está inspirado en Go, pero no implementan por completo la semántica de `encoding/json` de Go.

Usa el objeto `struct` y `Infer<T>` desde la entrada raíz:

```typescript
import { struct, type Infer } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  active: struct.boolean(),
})

type User = Infer<typeof User>
// { id: number; name: string; active: boolean }
```

## Constructores

Estos son algunos de los constructores habituales:

```typescript
struct.string()
struct.number()
struct.boolean()
struct.bigint()
struct.date()
struct.null()
struct.literal('ready')
struct.enum(['pending', 'done'])
struct.array(struct.string())
struct.tuple([struct.string(), struct.number()])
struct.object({ id: struct.number() })
struct.record(struct.number())
struct.or(struct.string(), struct.number())
struct.intersection(struct.object({ id: struct.number() }), struct.object({ name: struct.string() }))
struct.discriminatedUnion('kind', [
  struct.object({ kind: struct.literal('click'), x: struct.number() }),
  struct.object({ kind: struct.literal('key'), key: struct.string() }),
])
```

`struct.any()` y `struct.unknown()` aceptan valores sin restricciones. Los constructores binarios son `struct.blob()`, `struct.file()` y `struct.arrayBuffer()`.

Todos los Structs admiten estos modificadores:

```typescript
struct.string().optional()
struct.string().null()
struct.string().nullish()
struct.string().alias('wire_name')
```

## Valores cero

Los valores ausentes o `undefined` se decodifican a un valor cero salvo que el Struct sea opcional. Un `null` en un Struct que no admite nulos sigue el mismo camino. Un Struct nullable decodifica un valor ausente, `undefined` o `null` como `null`.

Estos son los principales valores cero:

| Struct                        | Valor cero                                           |
| ----------------------------- | ---------------------------------------------------- |
| `string`                      | `''`                                                 |
| `number`                      | `0`                                                  |
| `boolean`                     | `false`                                              |
| `bigint`                      | `0n`                                                 |
| `date`                        | `new Date(0)`                                        |
| array                         | `[]`                                                 |
| object                        | un objeto cuyos campos contienen sus valores cero    |
| tuple                         | una tupla cuyos elementos contienen sus valores cero |
| enum                          | el primer valor declarado                            |
| literal                       | el literal declarado                                 |
| `blob`, `file`, `arrayBuffer` | un valor vacío del tipo correspondiente              |
| `any`, `unknown`              | `undefined`                                          |

Dentro de un objeto, un campo ausente que solo tenga `.optional()` se omite de la salida decodificada. `.nullish()` es opcional y nullable; el tratamiento de null tiene prioridad cuando falta el valor, por lo que actualmente se decodifica como `null`.

```typescript
const Profile = struct.object({
  name: struct.string(),
  nickname: struct.string().optional(),
  biography: struct.string().null(),
})

// Decoding {} produces an object equivalent to:
// { name: '', biography: null }
```

Las claves desconocidas de un objeto se descartan. Los objetos y registros que devuelve el parseo tienen prototipo nulo. Si tu código depende de métodos de `Object.prototype`, usa `Object.keys`, `Object.entries` o copia el resultado de forma explícita a un objeto normal.

## La entrada parcial es intencionada

Las propiedades de entrada de un objeto son opcionales en el límite de TypeScript, incluso cuando la propiedad existe en la salida decodificada. Las secciones de petición de `struct.request(...)` también son opcionales.

```typescript
const Point = struct.object({
  x: struct.number(),
  y: struct.number(),
})

// A command using Point as input accepts {}.
// Structural decoding produces { x: 0, y: 0 }.
```

No describas estos campos como obligatorios. Los Structs no validan a nivel de aplicación campos requeridos, autorización, rangos, importes, formatos ni transiciones de estado. No existe una DSL pública de refinamiento, rango o formato.

`struct.number()` acepta `Infinity` positivo y negativo; entre los números de JavaScript solo excluye `NaN`. Comprueba que los valores sean finitos y aplica las reglas de rango y dominio en el código de aplicación antes de crear un comando. No pongas esas comprobaciones en `build`, porque `build` recibe una proyección vinculada al esquema, no los valores que ha pasado quien llama.

## Cuerpos de petición

`struct.request(...)` agrupa las secciones que se proyectan directamente sobre el protocolo:

```typescript
const input = struct.request({
  path: struct.object({ organizationId: struct.string() }),
  query: struct.object({ includeDisabled: struct.boolean().optional() }),
  headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
  body: struct.json(
    struct.object({
      displayName: struct.string().alias('display_name'),
    }),
  ),
})
```

Los límites de cuerpo son:

| Struct                     | Codificación      |
| -------------------------- | ----------------- |
| `struct.json(inner)`       | JSON              |
| `struct.text()`            | Texto sin formato |
| `struct.urlencoded(shape)` | `URLSearchParams` |
| `struct.formData(shape)`   | `FormData`        |
| `struct.blob()`            | `Blob`            |
| `struct.arrayBuffer()`     | `ArrayBuffer`     |

Consulta [Comandos](/es-ES/core/commands) para conocer el mapeo automático de peticiones y las restricciones de cada transporte.

## Alias

`.alias(name)` cambia la clave del protocolo sin cambiar la clave lógica de TypeScript.

```typescript
const UserBody = struct.object({
  id: struct.number().alias('user_id'),
  displayName: struct.string().alias('display_name'),
})

// Caller input uses { id, displayName }.
// JSON wire data uses { user_id, display_name }.
```

Los alias se aplican al decodificar y codificar claves JSON. La construcción automática de peticiones también los usa para las claves de salida de la ruta, la query, las cabeceras, la codificación URL y el multipart. Quien llama sigue utilizando las claves lógicas. En un `build` personalizado, las claves de destino explícitas se mantienen tal como las escribas.

## `StructError`

Un fallo de decodificación estructural produce un `StructError`, normalmente disponible como `RequestError.cause`.

```typescript
import { StructError, type RequestError, type StructIssue } from '@defjs/core'

export function structIssues(error: RequestError): readonly StructIssue[] {
  if (error.kind === 'definition' && error.cause instanceof StructError) {
    return error.cause.issues
  }
  return []
}
```

Un `StructError` expone:

- `issues`, el array `StructIssue[]` original;
- `format()`, un árbol anidado de mensajes;
- `flatten()`, mensajes generales y por campo en el primer nivel;
- `prettify()`, una cadena multilínea legible.

`StructIssue.received` puede contener datos de entrada o de respuesta. Los mensajes por defecto pueden incluir una representación de ese valor. Las rutas y las claves formateadas también pueden proceder de datos no fiables, sobre todo en los registros. Revisa o enmascara `issues`, los mensajes, `format()`, `flatten()` y `prettify()` antes de registrarlos o devolverlos.

## Mensajes de error globales

`setErrorMap(...)` sustituye la generación de mensajes para todo el proceso:

```typescript
import { setErrorMap } from '@defjs/core'

setErrorMap((issue) => {
  if (issue.code === 'invalid_type') {
    return `Invalid value at ${issue.path.join('.')}`
  }
  return undefined
})
```

El mapa es global, no pertenece a un cliente. Si lo cambias, afectará a los mensajes de las incidencias Struct que se creen después en todos los clientes del mismo entorno de JavaScript. No captures estado de una petición en el callback y coordina su instalación en aplicaciones que compartan un proceso.

## Siguiente paso

- [Comandos](/es-ES/core/commands) proyecta campos Struct sobre peticiones y mensajes.
- [Errores](/es-ES/core/errors) explica cómo aparecen los fallos Struct en las tuplas de ejecución.
- [HTTP](/es-ES/core/http) cubre la decodificación de respuestas y la limitación actual con JSON malformado.

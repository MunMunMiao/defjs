---
title: Struct
description: Describe la decodificación estructural estricta, las entradas obligatorias y opcionales, los alias y la gestión de StructError.
---

# Struct

Los Structs describen la decodificación estructural estricta y la codificación para el protocolo. Los valores obligatorios ausentes y los valores no válidos fallan en lugar de generar valores predeterminados.

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

`struct.any()` y `struct.unknown()` aceptan cualquier valor salvo `null` y `undefined`; los mismos modificadores permiten admitirlos explícitamente. Los constructores binarios son `struct.blob()`, `struct.file()` y `struct.arrayBuffer()`.

Todos los Structs admiten estos modificadores:

```typescript
struct.string().optional()
struct.string().null()
struct.string().nullish()
struct.string().alias('wire_name')
```

## Parseo estricto

Usa `struct.parse(schema, input)` para decodificar fuera de un comando. Devuelve una tupla fija con el error primero:

```typescript
const Profile = struct.object({
  name: struct.string(),
  nickname: struct.string().optional(),
  biography: struct.string().null(),
  note: struct.string().nullish(),
})

const [error, profile] = struct.parse(Profile, input)

if (error) {
  // profile is undefined
  return
}
```

```typescript
type ParseResult<T> = [error: null, value: T] | [error: StructError, value: undefined]
```

Hay un único contrato para los modificadores: los valores ausentes y `undefined` solo se aceptan con `.optional()` o `.nullish()`; el `null` explícito solo con `.null()` o `.nullish()`. `.null()` no hace que un valor sea opcional.

Los campos optional y nullish ausentes se omiten de la salida del objeto; en el nivel superior se decodifican como `undefined`. Las claves desconocidas se descartan. Los objetos y records decodificados tienen prototipo nulo.

## Entradas obligatorias de objetos y peticiones

Las propiedades de un objeto son obligatorias en TypeScript y en runtime salvo que su Struct sea optional o nullish. Cada sección declarada en `struct.request(...)` también es obligatoria; las secciones no declaradas no forman parte del tipo de entrada.

```typescript
const Input = struct.request({
  path: struct.object({ id: struct.string() }),
  query: struct.object({ page: struct.number().optional() }),
})

// { path: { id: string }; query: { page?: number } }
```

Omitir `query` es un error; `query: {}` es válido. Un campo obligatorio ausente, un `undefined` explícito, un `null` prohibido o un tipo de runtime incorrecto hacen fallar todo el parseo sin devolver un valor parcial.

Los Structs compuestos se detienen en el primer issue determinado. La longitud de una tuple debe coincidir exactamente con la declaración. `struct.or(...)` sigue probando alternativas en orden y `struct.discriminatedUnion(...)` sigue seleccionando una rama declarada.

Cuando los campos discriminadores usan alias, `struct.discriminatedUnion(...)` lee el primer discriminador del protocolo que exista realmente, siguiendo el orden de declaración de las opciones. Una vez elegida una rama, no lee los alias de opciones posteriores.

Los Structs exigen la estructura declarada, no reglas de aplicación sobre autorización, rangos, importes, formatos o transiciones de estado. No existe una DSL pública de refinamiento, rango o formato.

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
- [HTTP](/es-ES/core/http) cubre la decodificación de respuestas y los errores de representación.

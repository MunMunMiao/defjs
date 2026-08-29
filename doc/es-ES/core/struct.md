---
title: Struct
description: Modela formas de solicitud y respuesta, parsea unknowns y codifica cuerpos de cable.
---

# Struct

Modela una solicitud (y sus respuestas) como Structs. Obtienes tipos TypeScript vía `Infer`, y comprobaciones en runtime vía `struct.parse(...)` — sin throw, tupla error-first.

## Basic Setup

```typescript twoslash
import { defineRequest, struct, type Infer } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  active: struct.boolean(),
})

type User = Infer<typeof User>

const createUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.request({
    body: struct.json(
      struct.object({
        name: struct.string(),
        email: struct.string(),
      }),
    ),
  }),
  output: { 201: User },
})

const [parseError, user] = struct.parse(User, { id: 7, name: 'Ada', active: true })
if (!parseError) console.log(user.name)
void createUser
```

La salida parseada conserva solo los campos declarados. Campos requeridos ausentes, primitivos incorrectos, valores anidados malos, longitud de tupla incorrecta o `null` no permitido → `StructError`, sin valor parcial. Los Structs son inmutables; `.optional()` y compañía devuelven un Struct nuevo.

## Requerido, opcional, null

Presencia y nulabilidad son cosas distintas:

| Declaración                  | Ausente / `undefined`                   | `null`   | Valor válido           |
| ---------------------------- | --------------------------------------- | -------- | ---------------------- |
| `struct.string()`            | Rechazar                                | Rechazar | Aceptar string         |
| `struct.string().optional()` | Aceptar; omitir campo de objeto ausente | Rechazar | Aceptar string         |
| `struct.string().null()`     | Rechazar                                | Aceptar  | Aceptar string         |
| `struct.string().nullish()`  | Aceptar; omitir campo de objeto ausente | Aceptar  | Aceptar string         |
| `struct.null()`              | Rechazar                                | Aceptar  | Rechazar otros valores |

```typescript twoslash
import { struct } from '@defjs/core'

const Profile = struct.object({
  name: struct.string(),
  nickname: struct.string().optional(),
  biography: struct.string().null(),
  note: struct.string().nullish(),
})

const [error, profile] = struct.parse(Profile, {
  name: 'Ada',
  biography: null,
  note: undefined,
})
if (error) throw error
console.log(profile.name, profile.nickname, profile.biography, profile.note)
```

En la raíz, optional puede ser `undefined`. Dentro de un objeto, los campos optional/nullish omitidos se quedan ausentes. En `struct.request(...)`, una sección toda-optional puede omitirse (normalizada a `{}`); una sección con un campo requerido se queda requerida. Un wrapper de cuerpo presente → cuerpo requerido, aunque los campos internos sean opcionales.

## Wrappers de cuerpo de solicitud

`struct.request(...)` separa `path`, `query`, `headers` y `body`. Los cuerpos necesitan un codec explícito:

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const createUser = defineRequest({
  method: 'POST',
  path: '/organizations/:organizationId/users',
  input: struct.request({
    path: struct.object({ organizationId: struct.string() }),
    query: struct.object({ notify: struct.boolean().optional() }),
    headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
})

const command = createUser({
  path: { organizationId: 'acme' },
  query: { notify: true },
  headers: { requestId: 'request-42' },
  body: { displayName: 'Ada' },
})
void command
```

| Wrapper                    | Valor parseado   | Límite de cable                                                      |
| -------------------------- | ---------------- | -------------------------------------------------------------------- |
| `struct.json(inner)`       | Valor de `inner` | Texto JSON, `application/json`                                       |
| `struct.text()`            | `string`         | Texto, `text/plain;charset=UTF-8`                                    |
| `struct.urlencoded(shape)` | Objeto del shape | `URLSearchParams`, `application/x-www-form-urlencoded;charset=UTF-8` |
| `struct.formData(shape)`   | Objeto del shape | `FormData`; la plataforma pone el boundary multipart                 |
| `struct.blob()`            | `Blob`           | Tipo del Blob o `application/octet-stream`                           |
| `struct.file()`            | `File`           | `File` nativo (name + type)                                          |
| `struct.arrayBuffer()`     | `ArrayBuffer`    | Buffer, `application/octet-stream`                                   |

`struct.file()` es un Struct de valor para campos de formulario — no un `request.body` autónomo. Los cuerpos binarios son `struct.blob()` y `struct.arrayBuffer()`. Structs bare de object/array/primitive no son válidos como `request.body`. SSE rechaza `body`. La entrada de solicitud WebSocket rechaza `body` y `headers`.

## Alias

`.alias(...)` separa nombres lógicos de nombres de cable. `struct.parse(...)` usa claves lógicas. Los codecs JSON y de solicitud plana codifican alias; la decodificación de respuesta JSON mapea claves de cable de vuelta a campos lógicos.

```typescript twoslash
import { struct } from '@defjs/core'

const User = struct.object({
  displayName: struct.string().alias('display_name'),
})

const [parseError, user] = struct.parse(User, { displayName: 'Ada' })
if (parseError) throw parseError
console.log(user.displayName)

const [wireError] = struct.parse(User, { display_name: 'Ada' })
console.log(wireError?.issues[0]?.path)
```

| Límite                                             | Campo                        |
| -------------------------------------------------- | ---------------------------- |
| `struct.parse(User, ...)`                          | Lógico `displayName`         |
| Codificación de solicitud JSON                     | Cable `display_name`         |
| Decodificación de respuesta JSON                   | Cable → lógico `displayName` |
| Codificación query, header, URL-encoded, multipart | Alias de cable como clave    |

Los alias funcionan en campos anidados, arrays, objects, unions y discriminadores. Mantén los nombres lógicos en el código de la app; pon el naming externo en el Struct.

## Fallos de parse

`struct.parse(...)` devuelve `[null, value]` o `[StructError, undefined]`. `StructError` extiende `Error` y expone `issues`, más `format()`, `flatten()` y `prettify()`.

```typescript twoslash
import { struct, StructError } from '@defjs/core'

const User = struct.object({ id: struct.number(), name: struct.string() })
const [error, value] = struct.parse(User, { id: 'not-a-number' })

if (error) {
  console.log(error instanceof StructError)
  console.log(error.issues[0]?.code, error.issues[0]?.path)
  console.log(error.flatten().fieldErrors)
  console.log(error.format(), error.prettify())
}
void value
```

Un `StructIssue` tiene `code`, `expected`, `message`, `path` y `received`. Los issues pueden guardar entrada no confiable — redacta antes de registrar o devolver. `struct.parse(..., { errorMap })` rewrites issue messages for that call only.

La validación Struct es solo estructural. No hay reglas públicas de rango, formato, refinement, auth o transición de estado. Haz esas comprobaciones antes de construir un comando.

## Reference

Constructores públicos en `@defjs/core` (los internos no son APIs de fachada):

```typescript twoslash
import { struct } from '@defjs/core'

const Any = struct.any()
const ArrayOfStrings = struct.array(struct.string())
const Bytes = struct.arrayBuffer()
const BigIntValue = struct.bigint()
const BlobValue = struct.blob()
const BooleanValue = struct.boolean()
const DateValue = struct.date()
const Discriminated = struct.discriminatedUnion('kind', [
  struct.object({ kind: struct.literal('created'), id: struct.number() }),
  struct.object({ kind: struct.literal('deleted'), id: struct.number() }),
])
const Status = struct.enum(['draft', 'published'])
const FileValue = struct.file()
const Form = struct.formData({ file: struct.file() })
const Combined = struct.intersection(struct.object({ id: struct.number() }), struct.object({ name: struct.string() }))
const JsonBody = struct.json(struct.object({ ok: struct.boolean() }))
const Literal = struct.literal('ready')
const NullValue = struct.null()
const NumberValue = struct.number()
const ObjectValue = struct.object({ id: struct.number() })
const Union = struct.or(struct.string(), struct.number())
const RecordValue = struct.record(struct.number())
const Request = struct.request({ path: struct.object({ id: struct.number() }) })
const StringValue = struct.string()
const TextBody = struct.text()
const Tuple = struct.tuple([struct.string(), struct.number()])
const Unknown = struct.unknown()
const FormUrlEncoded = struct.urlencoded({ name: struct.string() })

void [Any, ArrayOfStrings, Bytes, BigIntValue, BlobValue, BooleanValue, DateValue, Discriminated, Status, FileValue, Form, Combined]
void [
  JsonBody,
  Literal,
  NullValue,
  NumberValue,
  ObjectValue,
  Union,
  RecordValue,
  Request,
  StringValue,
  TextBody,
  Tuple,
  Unknown,
  FormUrlEncoded,
]
```

| Constructor                      | Entrada                                                        | Salida inferida                  |
| -------------------------------- | -------------------------------------------------------------- | -------------------------------- |
| `struct.number()`                | Número distinto de `NaN`                                       | `number`, incluyendo ±`Infinity` |
| `struct.date()`                  | `Date`, number o string de fecha                               | `Date` válido                    |
| `struct.bigint()`                | `bigint` o string aceptado por `BigInt(...)`                   | `bigint`                         |
| `struct.enum(...)`               | Miembro string o number declarado                              | Esa unión literal                |
| `struct.discriminatedUnion(...)` | Objeto con discriminador literal requerido                     | Rama de objeto seleccionada      |
| `struct.or(...)`                 | Primera rama coincidente; la codificación comprueba ambigüedad | Unión de salidas de rama         |
| `struct.intersection(...)`       | Valores aceptados por cada miembro                             | Intersección de salidas          |
| `struct.record(value)`           | Objeto plano cuyos valores coinciden con `value`               | Record de valores parseados      |
| `struct.tuple(items)`            | Array de exactamente la longitud declarada                     | Tupla de longitud fija           |

Cada Struct soporta `.alias(name)`, `.optional()`, `.null()` y `.nullish()`. `struct.discriminatedUnion` necesita opciones de objeto con un discriminador literal requerido y rechaza duplicados.

Importa `struct`, `Infer`, `Struct`, `StructError` y tipos públicos relacionados desde `@defjs/core`. Usa `struct.parse(...)` como parser. No importes `createObjectStruct`, símbolos de definición, internos de codec ni `packages/core/src`.

No-promesas de la fachada:

- Las salidas object/record usan un prototipo null — no asumas métodos de `Object.prototype`.
- Las claves de objeto desconocidas se descartan.
- `struct.number()` rechaza `NaN`, acepta infinitos.
- `struct.or(...)` prueba ramas en orden; rechaza codificaciones ambiguas cuando las ramas discrepan.
- `struct.intersection(...)` parsea miembros en orden de declaración.
- Un Struct valida un límite; no cachea, no autoriza ni es dueño de un recurso de transporte.

## Recetas relacionadas

- [POST JSON](../recipes/post-json.md)
- [GET con un 404 declarado](../recipes/get-declared-404.md)

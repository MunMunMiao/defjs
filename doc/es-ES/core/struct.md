---
title: Struct
description: Declarative schema definition, type inference, error mapping, and the field tag system.
---

# Struct

`@defjs/core` proporciona una fachada ligera de struct para declarar esquemas, validar entradas e inferir tipos. La intención de diseño está modelada tras el `encoding/json` de Go: respaldo de valor cero, aceptación de entrada parcial y comportamiento de runtime estable y predecible.

## Tipos primitivos

Todos los esquemas se crean a través del espacio de nombres `struct`, admitiendo llamadas encadenadas `.optional()`, `.null()`, `.nullish()` y `.tag(...)`.

### Escalares

```typescript
import { struct } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  active: struct.boolean(),
  role: struct.literal('admin'),
})

type User = struct.Infer<typeof User>
// { id: number; name: string; active: boolean; role: 'admin' }
```

Escalares disponibles:

| Constructor            | Tipo de entrada                         | Tipo de salida | Valor cero           |
| ---------------------- | --------------------------------------- | -------------- | -------------------- |
| `struct.string()`      | `string \| undefined`                   | `string`       | `''`                 |
| `struct.number()`      | `number \| undefined`                   | `number`       | `0`                  |
| `struct.boolean()`     | `boolean \| undefined`                  | `boolean`      | `false`              |
| `struct.bigint()`      | `bigint \| string \| undefined`         | `bigint`       | `0n`                 |
| `struct.date()`        | `Date \| number \| string \| undefined` | `Date`         | `new Date(0)`        |
| `struct.null()`        | `null`                                  | `null`         | `null`               |
| `struct.any()`         | `unknown`                               | `any`          | `undefined`          |
| `struct.unknown()`     | `unknown`                               | `unknown`      | `undefined`          |
| `struct.blob()`        | `Blob \| undefined`                     | `Blob`         | `new Blob()`         |
| `struct.file()`        | `File \| undefined`                     | `File`         | `new File([], '')`   |
| `struct.arrayBuffer()` | `ArrayBuffer \| undefined`              | `ArrayBuffer`  | `new ArrayBuffer(0)` |

### Opcional y anulable

```typescript
const Profile = struct.object({
  bio: struct.string().optional(), // Tipo de salida: string | undefined
  age: struct.number().null(), // Tipo de salida: number | null
  nick: struct.string().nullish(), // Tipo de salida: string | null | undefined
})
```

### Enumeraciones y literales

```typescript
const Status = struct.enum(['pending', 'done', 'cancelled'])
const Priority = struct.objectEnum({ Low: 1, Medium: 2, High: 3 })

const Flag = struct.literal(true)
```

### Matrices, tuplas, registros

```typescript
const Tags = struct.array(struct.string())
const Pair = struct.tuple([struct.string(), struct.number()])
const Dict = struct.record(struct.number())
```

### Uniones e intersecciones

```typescript
const Id = struct.union([struct.string(), struct.number()])
const Named = struct.intersection(struct.object({ id: struct.number() }), struct.object({ name: struct.string() }))
```

### Uniones discriminadas

```typescript
const Event = struct.discriminatedUnion('kind', [
  struct.object({ kind: struct.literal('click'), x: struct.number(), y: struct.number() }),
  struct.object({ kind: struct.literal('key'), key: struct.string() }),
])
```

## Esquemas de petición

`struct.request(...)` organiza `path`, `query`, `headers` y `body` en una única estructura de entrada para construcción automática de petición HTTP por el endpoint.

```typescript
const CreateUser = struct.request({
  path: struct.object({ orgId: struct.number() }),
  query: struct.object({ dryRun: struct.boolean().optional() }),
  headers: struct.object({
    'X-Api-Key': struct.string().tag(tag.header('X-Api-Key')),
  }),
  body: struct.json(
    struct.object({
      name: struct.string().tag(tag.json('user_name')),
    }),
  ),
})
```

Los envoltorios de cuerpo determinan la codificación de transporte:

| Envoltorio                 | Codificación        |
| -------------------------- | ------------------- |
| `struct.json(schema)`      | `JSON.stringify`    |
| `struct.urlencoded(shape)` | `URLSearchParams`   |
| `struct.formData(shape)`   | `FormData`          |
| `struct.text()`            | Texto plano         |
| `struct.blob()`            | Blob binario        |
| `struct.arrayBuffer()`     | ArrayBuffer binario |

## Inferencia de tipos `Infer<T>`

`struct.Infer<T>` extrae el tipo de salida de un esquema. Es el único helper a nivel de tipos que necesitas dominar.

```typescript
const Person = struct.object({
  name: struct.string(),
  age: struct.number().optional(),
})

type Person = struct.Infer<typeof Person>
// { name: string; age?: number }
```

`Infer` también funciona para `struct.array(...)`, `struct.union(...)`, `struct.request(...)`:

```typescript
type Tags = struct.Infer<typeof Tags> // string[]
type Id = struct.Infer<typeof Id> // string | number
type Req = struct.Infer<typeof CreateUser> // { path: { orgId: number }; query?: { dryRun?: boolean }; ... }
```

## StructError y mapeo de errores

Cuando la validación falla, el runtime devuelve `StructError` conteniendo un `SchemaIssue[]` completo.

```typescript
import { struct, StructError } from '@defjs/core'

const [error, value] = struct.parseTuple(User, { id: 42 })
if (error) {
  console.log(error.issues)
  // [{ code: 'missing_key', path: ['name'], expected: 'string', received: undefined, message: '...' }]
}
```

### Formateo de errores

```typescript
error.format() // Objeto árbol { _errors: [], name: { _errors: ['...'] } }
error.flatten() // Objeto plano { formErrors: [], fieldErrors: { name: ['...'] } }
error.prettify() // String: "× name: Expected string, received undefined"
```

### Mapeo global de errores

Reemplaza mensajes por defecto mediante `setErrorMap`:

```typescript
import { setErrorMap } from '@defjs/core'

setErrorMap((issue) => {
  if (issue.code === 'missing_key') {
    return `Field ${issue.path.join('.')} is required`
  }
  return undefined // Los issues no cubiertos usan mensajes por defecto
})
```

## Sistema de etiquetas

Las etiquetas son metadatos adjuntos a campos, leídos por codecs, constructores de petición o adaptadores externos. El core proporciona 6 espacios de nombres integrados:

| Espacio de nombres      | Propósito                              | Comportamiento sin argumento                     |
| ----------------------- | -------------------------------------- | ------------------------------------------------ |
| `tag.json()`            | Clave de wire de campo JSON            | Recae al nombre del campo                        |
| `tag.urlencoded()`      | Clave de wire de campo URL-encoded     | Recae al nombre del campo                        |
| `tag.multipart()`       | Clave de wire de campo multipart       | Recae al nombre del campo                        |
| `tag.query(fieldName)`  | Clave de wire de parámetro de consulta | **Debe proporcionarse explícitamente el nombre** |
| `tag.uri(fieldName)`    | Clave de wire de parámetro de ruta URI | **Debe proporcionarse explícitamente el nombre** |
| `tag.header(fieldName)` | Clave de wire de cabecera HTTP         | **Debe proporcionarse explícitamente el nombre** |

### Ejemplo de uso

```typescript
import { struct, tag } from '@defjs/core'

const UserBody = struct.object({
  id: struct.number().tag(tag.json('user_id')),
  name: struct.string().tag(tag.json('user_name')),
  email: struct.string().tag(tag.header('X-User-Email')),
})
```

### Etiqueta de config personalizada

`tag.defineConfig` permite que bibliotecas de terceros definan su propio espacio de nombres y clave de config:

```typescript
import { tag } from '@defjs/core'

const GormTag = tag.createTagNamespace('gorm')
const gorm = tag.defineConfig(GormTag)

const Model = struct.object({
  id: struct.number().tag(gorm('column', 'id'), gorm('primaryKey')),
})
```

Reglas:

- Dentro del mismo espacio de nombres, un `value` posterior anula a uno anterior.
- Dentro del mismo espacio de nombres y misma clave `config`, un valor posterior anula a uno anterior.
- El valor de config solo puede ser `string | number | boolean`.

### Leer etiquetas

```typescript
import { getFieldTag, getFieldTags, tag } from '@defjs/core'

const field = UserBody.shape.name
const jsonTag = getFieldTag(field, tag.kind.json, 'name')
// { namespace: JsonTag, value: 'user_name', config: Map() }
```

## Introspección de campos

`getStructFields` expande un esquema de objeto en una lista de campos legible, conteniendo clave de campo, sub-esquema y etiquetas materializadas.

```typescript
import { getStructFields } from '@defjs/core'

const fields = getStructFields(UserBody)
// [
//   { key: 'id', struct: NumberSchema, tags: Map<symbol, FieldTag> },
//   { key: 'name', struct: StringSchema, tags: Map<symbol, FieldTag> },
// ]
```

Combinado con `isObjectStruct` para comprobación segura de tipo antes de introspección:

```typescript
import { isObjectStruct, getStructFields } from '@defjs/core'

if (isObjectStruct(schema)) {
  for (const field of getStructFields(schema)) {
    console.log(field.key, field.tags.get(tag.kind.json)?.value)
  }
}
```

## Respaldo de valor cero y entrada parcial

El parser de struct sigue la semántica de `encoding/json` de Go:

1. **Campos faltantes** → rellenados con el valor cero del tipo, no lanzando `missing_key`.
2. **Entrada parcial** → permite pasar solo algunos campos; los campos no establecidos se auto-rellenan con valores cero.
3. **`undefined` y `null`** → campos `optional` devuelven `undefined`; campos `nullable` devuelven `null`; otros devuelven valores cero.

```typescript
const Point = struct.object({ x: struct.number(), y: struct.number() })

struct.parseValue(Point, {}) // { x: 0, y: 0 }
struct.parseValue(Point, { x: 1 }) // { x: 1, y: 0 }
```

Esto es por diseño, no un bug. Beneficios:

- Los formularios front-end pueden enviar solo campos modificados; el backend aún recibe una estructura completa.
- Evita la propagación de `undefined` a través de objetos; la salida es siempre segura de atravesar.
- Modelo mental consistente con el unmarshaling de json de Go, unificando la colaboración entre lenguajes.

Si necesitas validación estricta (los campos faltantes deben dar error), comprueba explícitamente en la función `build` del endpoint, o usa `struct.parseTuple` para manejar el resultado `[error, value]` tú mismo.

## Qué sigue

- [Comandos →](/core/commands) — Usar struct con `defineRequest`, `defineEventStream` y `defineWebSocket`
- [HTTP →](/core/http) — Codificación de cuerpo de petición y validación de respuesta
- [Contexto →](/core/context) — Build automático y capacidades de request builder

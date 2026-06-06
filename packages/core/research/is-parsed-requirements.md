# schema.isParsed requirements

## Background

HTTP endpoints can define different response schemas by status:

```ts
output: [
  {
    status: [200, 201],
    body: userSchema,
  },
  {
    status: 404,
    body: errorSchema,
  },
]
```

When `status: [200, 201]` is written without `as const`, TypeScript widens the status list to `number[]`. The current status classifier cannot prove that the body belongs to a `2xx` status, so success `data` can degrade to `unknown`.

When status literals are preserved, for example with `status: [200, 201] as const`, success `data` is inferred from all `2xx` schemas. If `200` and `201` use the same schema, `data` is that schema output. If they use different schemas, `data` is a union:

```ts
Infer<typeof userSchema> | Infer<typeof createdUserSchema>
```

The current HTTP await tuple does not correlate `response.status` with `data` as a discriminated union, so this does not narrow automatically:

```ts
if (response.status === 201) {
  data
  // still User | CreatedUser
}
```

This document defines a schema-side parsed-output guard that lets users narrow the union explicitly:

```ts
if (userSchema.isParsed(data)) {
  data
  // User
}
```

## Goal

Add a method to every schema instance:

```ts
isParsed(value: unknown): value is Infer<typeof schema>
```

`isParsed` is an output-side type guard. It answers whether a value can be treated as the parsed output of that schema.

## Naming

The method must be named `isParsed`, not `is`.

`is` is easy to read as a structural validator: "does this arbitrary value match the schema right now?" That is not the intended primary contract. The intended contract is parsed-output recognition, including provenance for object-like values.

Related names and their intended meanings:

| Name | Meaning | In scope |
| --- | --- | --- |
| `accepts(input)` | Input-side check before parsing | No |
| `matches(value)` | Structural output check | No |
| `is(value)` | Ambiguous structural/provenance check | No |
| `isDecoded(value)` | Parsed by a codec/transport | No |
| `isParsed(value)` | Parsed-output recognition and type guard | Yes |

## Semantics

`isParsed` is not the same as the current primitive definition `is` function.

The current primitive `definition.is` is an input guard used during parsing. Some schemas accept input that is not their output type:

```ts
struct.bigint()
// input: bigint | string | undefined
// output: bigint

struct.date()
// input: Date | number | string | undefined
// output: Date
```

Therefore `isParsed` must use output semantics:

```ts
struct.bigint().isParsed(value)
// true only for bigint

struct.date().isParsed(value)
// true only for valid Date objects
```

For primitive and scalar schemas, `isParsed` should use direct runtime checks. Primitive values cannot carry hidden metadata and do not need it.

For object-like schemas, `isParsed` should use parse provenance. A plain object with the same shape is not considered parsed by that schema unless it went through parsing and received that schema's hidden parsed brand.

## Provenance Brand

Add an internal hidden brand for parsed object-like outputs:

```ts
markParsed(schema, value)
hasParsedBrand(schema, value)
```

The brand must be:

- written only to non-null objects/functions where `Object.defineProperty` is possible;
- non-enumerable;
- invisible to JSON serialization;
- not exposed as a public field;
- specific enough to distinguish different schema instances.

The implementation does not need to protect against later mutation of parsed values. If a parsed object is mutated after parsing, `isParsed` may continue to return true.

## Schema Coverage

The current facade exposes these schema constructors:

```ts
struct.any
struct.array
struct.arrayBuffer
struct.bigint
struct.blob
struct.boolean
struct.date
struct.discriminatedUnion
struct.enum
struct.file
struct.formData
struct.intersection
struct.json
struct.literal
struct.null
struct.number
struct.object
struct.or
struct.record
struct.request
struct.string
struct.text
struct.tuple
struct.unknown
struct.urlencoded
```

### Primitive and scalar schemas

| Schema | `isParsed` implementation |
| --- | --- |
| `struct.string()` | `typeof value === 'string'` |
| `struct.number()` | `typeof value === 'number' && !Number.isNaN(value)` |
| `struct.boolean()` | `typeof value === 'boolean'` |
| `struct.null()` | `value === null` |
| `struct.bigint()` | `typeof value === 'bigint'` |
| `struct.date()` | `value instanceof Date && !Number.isNaN(value.getTime())` |
| `struct.blob()` | `value instanceof Blob` |
| `struct.file()` | `value instanceof File` |
| `struct.arrayBuffer()` | `value instanceof ArrayBuffer` |
| `struct.literal(x)` | `Object.is(value, x)` |
| `struct.enum([...])` | `definition.values.includes(value)` |
| `struct.enum(object)` | same as enum array; constructor normalizes to `enum` kind |
| `struct.any()` | always `true`; narrows to `any` |
| `struct.unknown()` | always `true`; output type remains `unknown` |

### Object-like schemas

| Schema | `isParsed` implementation |
| --- | --- |
| `struct.object(shape)` | `hasParsedBrand(schema, value)` |
| `struct.array(item)` | `hasParsedBrand(schema, value)` on the array output |
| `struct.record(value)` | `hasParsedBrand(schema, value)` on the object output |
| `struct.tuple(items)` | `hasParsedBrand(schema, value)` on the tuple array output |
| `struct.request(shape)` | `hasParsedBrand(schema, value)` on the parsed request output |

Object-like outputs should be marked when parse succeeds. Current object parsing creates a fresh `Object.create(null)` output, so marking the parsed output is compatible with existing parse behavior.

### Composition schemas

| Schema | `isParsed` implementation |
| --- | --- |
| `struct.or(a, b)` | `hasParsedBrand(schema, value) || options.some(option => option.isParsed(value))` |
| `struct.discriminatedUnion(key, options)` | `hasParsedBrand(schema, value) || option selected by discriminator calls option.isParsed(value)` |
| `struct.intersection(a, b)` | Prefer `hasParsedBrand(schema, value)`; fallback may be `a.isParsed(value) && b.isParsed(value)` |

Intersection parsing can merge object outputs into a new final object. The final merged value must be marked with the intersection schema brand if provenance checking is used.

Union and discriminated union parsing should mark the final value with the union schema brand when possible. They may also rely on the selected option's `isParsed`.

### Request body wrappers

Request body schemas wrap an inner schema. They are primarily endpoint input contracts, but `isParsed` should still be defined consistently.

| Schema | `isParsed` implementation |
| --- | --- |
| `struct.json(schema)` | delegate to inner `schema.isParsed(value)` or check wrapper brand |
| `struct.urlencoded(shape)` | delegate to the internal object schema |
| `struct.formData(shape)` | delegate to the internal object schema |
| `struct.text()` | delegate to the internal string schema |

### Modifiers

| Modifier | `isParsed` implementation |
| --- | --- |
| `.optional()` | `value === undefined || base.isParsed(value)` |
| `.null()` | `value === null || base.isParsed(value)` |
| `.nullish()` | `value === null || value === undefined || base.isParsed(value)` |
| `.tag(...)` | Does not change output type. If brands are schema-instance specific, values parsed by the tagged schema should carry the tagged schema brand. |

## Type Behavior

Example with different success schemas:

```ts
const getUserInfo = defineRequest({
  method: 'GET',
  path: '/users/:id',
  output: [
    {
      status: 200,
      body: userSchema,
    },
    {
      status: 201,
      body: createdUserSchema,
    },
    {
      status: 404,
      body: errorSchema,
    },
  ] as const,
})

const [error, data, response] = await getUserInfo({
  path: { id: 1 },
  query: { withProfile: true },
})

if (!error) {
  data
  // User | CreatedUser

  if (userSchema.isParsed(data)) {
    data
    // User
  }

  if (createdUserSchema.isParsed(data)) {
    data
    // CreatedUser
  }
}
```

`404` response data remains on `error.data`; it must not enter success `data`.

## Non-goals

- Do not rename the method to `is`.
- Do not implement structural validation under the `isParsed` name.
- Do not guarantee safety after users mutate parsed output objects.
- Do not require ordinary hand-written objects to pass object schema `isParsed`.
- Do not require this feature to replace status-data correlated HTTP tuple typing.
- Do not change response status literal inference rules in this requirement.

## Acceptance Criteria

- Every schema instance exposes `isParsed(value): value is Output`.
- Primitive, literal, enum, `null`, `bigint`, and `date` use output-side checks.
- Object-like parsed outputs receive a hidden non-enumerable provenance brand.
- Two structurally identical object schemas can be distinguished by `isParsed` if their outputs were parsed by different schema instances.
- `struct.bigint().isParsed('1')` returns false even though `'1'` is valid parse input.
- `struct.date().isParsed('2026-05-26')` returns false even though the string may be valid parse input.
- `userSchema.isParsed(data)` narrows `data` to `Infer<typeof userSchema>`.
- `createdUserSchema.isParsed(data)` narrows `data` to `Infer<typeof createdUserSchema>`.
- Existing parse/encode behavior is not changed except for hidden metadata on parsed object-like outputs.

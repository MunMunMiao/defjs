import { issue } from './errors'
import { castSchema, createPrimitiveSchema, DEFAULT_FLAGS, makeSchema } from './runtime'
import { assertSchema } from './shape'
import { DEFINITION } from './symbols'
import type {
  ArraySchema,
  DiscriminatedUnionSchema,
  Infer,
  LiteralValue,
  NumberSchema,
  ObjectSchema,
  ObjectShape,
  RecordSchema,
  RequestBodyCodec,
  RequestBodySchema,
  RequestSchema,
  RequestShape,
  RuntimeSchema,
  Schema,
  SchemaLike,
  StringSchema,
  TupleSchema,
  UnionSchema,
} from './types'
import { describeValue, failure, isPlainObject, success } from './utils'

export function createStringSchema(): StringSchema {
  return castSchema<StringSchema>(
    createPrimitiveSchema({
      expected: 'string',
      is: (value): value is string => typeof value === 'string',
      kind: 'string',
      zero: () => '',
    }),
  )
}

export function createNumberSchema(): NumberSchema {
  return castSchema<NumberSchema>(
    createPrimitiveSchema({
      expected: 'number',
      is: (value): value is number => typeof value === 'number' && !Number.isNaN(value),
      kind: 'number',
      zero: () => 0,
    }),
  )
}

export function createBooleanSchema(): Schema<boolean | undefined, boolean> {
  return createPrimitiveSchema({
    expected: 'boolean',
    is: (value): value is boolean => typeof value === 'boolean',
    kind: 'boolean',
    zero: () => false,
  })
}

export function createNullSchema(): Schema<null, null> {
  return castSchema<Schema<null, null>>(
    createPrimitiveSchema({
      expected: 'null',
      is: (value): value is null => value === null,
      kind: 'null',
      zero: () => null,
    }),
  )
}

// oxlint-disable-next-line typescript/no-explicit-any
export function createAnySchema(): Schema<unknown, any> {
  // Type boundary: struct.any() intentionally models an unconstrained decoded value; any is the correct
  // representation of "no static type information" at the output boundary.
  // oxlint-disable-next-line typescript/no-explicit-any
  return castSchema<Schema<unknown, any>>(
    makeSchema({
      flags: DEFAULT_FLAGS,
      kind: 'any',
    }),
  )
}

export function createUnknownSchema(): Schema<unknown, unknown> {
  return castSchema<Schema<unknown, unknown>>(
    makeSchema({
      flags: DEFAULT_FLAGS,
      kind: 'unknown',
    }),
  )
}

export function createLiteralSchema<const T extends LiteralValue>(value: T): Schema<T | undefined, T> {
  return castSchema<Schema<T | undefined, T>>(
    makeSchema({
      expected: describeValue(value),
      flags: DEFAULT_FLAGS,
      kind: 'literal',
      value,
    }),
  )
}

export function createEnumSchema<const T extends readonly [string, ...string[]]>(values: T): Schema<T[number] | undefined, T[number]> {
  const enumValues = [...values] as unknown as T
  return castSchema<Schema<T[number] | undefined, T[number]>>(
    makeSchema({
      expected: enumValues.map((item) => JSON.stringify(item)).join(' | '),
      flags: DEFAULT_FLAGS,
      kind: 'enum',
      values: enumValues,
    }),
  )
}

export function createObjectEnumSchema<const T extends Record<string, number | string>>(
  value: T,
): Schema<T[keyof T] | undefined, T[keyof T]> {
  const values = Object.values(value).filter((item): item is T[keyof T] => typeof item === 'number' || typeof item === 'string')

  if (values.length === 0) {
    throw new TypeError('enum schema requires at least one string or number value')
  }

  return castSchema<Schema<T[keyof T] | undefined, T[keyof T]>>(
    makeSchema({
      expected: values.map((item) => JSON.stringify(item)).join(' | '),
      flags: DEFAULT_FLAGS,
      kind: 'enum',
      values: values as [T[keyof T], ...T[keyof T][]],
    }),
  )
}

export function createArraySchema<S extends SchemaLike<unknown, unknown, boolean>>(item: S): ArraySchema<S> {
  assertSchema(item, 'array item')

  return castSchema<ArraySchema<S>>(
    makeSchema({
      flags: DEFAULT_FLAGS,
      item,
      kind: 'array',
    }),
  )
}

export function createObjectSchema<T extends ObjectShape>(shape: T): ObjectSchema<T> {
  if (!isPlainObject(shape)) {
    throw new TypeError('object schema requires a plain object')
  }

  const declaredShape = snapshotObjectShape(shape)

  return castSchema<ObjectSchema<T>>(
    makeSchema({
      cache: new WeakMap(),
      flags: DEFAULT_FLAGS,
      kind: 'object',
      shape: declaredShape,
    }),
  )
}

export function createRequestSchema<const T extends RequestShape>(shape: T): RequestSchema<T> {
  if (!isPlainObject(shape)) {
    throw new TypeError('request schema requires a plain object')
  }

  const path = shape.path
  const query = shape.query
  const headers = shape.headers
  const body = shape.body

  if (path) {
    assertObjectSchema(path, 'request.path')
  }
  if (query) {
    assertObjectSchema(query, 'request.query')
  }
  if (headers) {
    assertObjectSchema(headers, 'request.headers')
  }
  if (body) {
    assertRequestBodySchema(body)
  }

  return castSchema<RequestSchema<T>>(
    makeSchema({
      body,
      flags: DEFAULT_FLAGS,
      headers,
      kind: 'request',
      path,
      query,
    }),
  )
}

export function createRequestBodySchema<const C extends RequestBodyCodec, S extends SchemaLike<unknown, unknown, boolean>>(
  codec: C,
  schema: S,
): RequestBodySchema<C, S> {
  assertSchema(schema, `${codec} body`)

  return castSchema<RequestBodySchema<C, S>>(
    makeSchema({
      codec,
      flags: DEFAULT_FLAGS,
      kind: 'requestBody',
      schema,
    }),
  )
}

function assertRequestBodySchema(schema: SchemaLike<unknown, unknown, boolean>): void {
  assertSchema(schema, 'request.body')

  const definition = (schema as unknown as RuntimeSchema)[DEFINITION]
  if (definition.kind === 'requestBody' || definition.kind === 'blob' || definition.kind === 'arrayBuffer') {
    return
  }

  throw new TypeError('body must use a body wrapper schema')
}

export function createJsonBodySchema<S extends SchemaLike<unknown, unknown, boolean>>(schema: S): RequestBodySchema<'json', S> {
  return createRequestBodySchema('json', schema)
}

export function createUrlencodedBodySchema<T extends ObjectShape>(shape: T): RequestBodySchema<'urlencoded', ObjectSchema<T>> {
  return createRequestBodySchema('urlencoded', createObjectSchema(shape))
}

export function createFormDataBodySchema<T extends ObjectShape>(shape: T): RequestBodySchema<'formData', ObjectSchema<T>> {
  return createRequestBodySchema('formData', createObjectSchema(shape))
}

export function createTextBodySchema(): RequestBodySchema<'text', StringSchema> {
  return createRequestBodySchema('text', createStringSchema())
}

export function createRecordSchema<S extends SchemaLike<unknown, unknown, boolean>>(value: S): RecordSchema<S> {
  assertSchema(value, 'record value')

  return castSchema<RecordSchema<S>>(
    makeSchema({
      flags: DEFAULT_FLAGS,
      kind: 'record',
      value,
    }),
  )
}

export function createTupleSchema<
  const T extends readonly [SchemaLike<unknown, unknown, boolean>, ...SchemaLike<unknown, unknown, boolean>[]],
>(items: T): TupleSchema<T> {
  const tupleItems = [...items] as unknown as T
  for (const item of tupleItems) {
    assertSchema(item, 'tuple item')
  }

  return castSchema<TupleSchema<T>>(
    makeSchema({
      flags: DEFAULT_FLAGS,
      items: tupleItems,
      kind: 'tuple',
    }),
  )
}

export function createUnionSchema<
  const T extends readonly [SchemaLike<unknown, unknown, boolean>, ...SchemaLike<unknown, unknown, boolean>[]],
>(options: T): UnionSchema<T> {
  const unionOptions = [...options] as unknown as T
  for (const option of unionOptions) {
    assertSchema(option, 'or option')
  }

  return castSchema<UnionSchema<T>>(
    makeSchema({
      flags: DEFAULT_FLAGS,
      kind: 'or',
      options: unionOptions,
    }),
  )
}

export function createDiscriminatedUnionSchema<
  const TDiscriminator extends string,
  const TOptions extends readonly [ObjectSchema<ObjectShape>, ...ObjectSchema<ObjectShape>[]],
>(discriminator: TDiscriminator, options: TOptions): DiscriminatedUnionSchema<TOptions> {
  const unionOptions = [...options] as unknown as TOptions
  const map = new Map<unknown, SchemaLike<unknown, unknown, boolean>>()
  const values: unknown[] = []

  for (const option of unionOptions) {
    assertSchema(option, 'discriminatedUnion option')
    const optionDef = (option as unknown as RuntimeSchema)[DEFINITION]
    /* istanbul ignore next -- type-safe: createDiscriminatedUnionSchema only accepts ObjectSchema */
    if (optionDef.kind !== 'object') {
      throw new TypeError('discriminatedUnion options must be object schemas')
    }
    const fieldSchema = optionDef.shape[discriminator] as unknown as RuntimeSchema | undefined
    if (!fieldSchema) {
      throw new TypeError(`discriminatedUnion option missing discriminator field "${discriminator}"`)
    }
    const fieldDef = fieldSchema[DEFINITION]
    /* istanbul ignore next -- type-safe: discriminator is checked at compile time */
    if (fieldDef.kind !== 'literal') {
      throw new TypeError(`discriminatedUnion option discriminator "${discriminator}" must be a literal schema`)
    }
    if (map.has(fieldDef.value)) {
      throw new TypeError(`discriminatedUnion duplicate discriminator value: ${JSON.stringify(fieldDef.value)}`)
    }
    map.set(fieldDef.value, option)
    values.push(fieldDef.value)
  }

  return castSchema<DiscriminatedUnionSchema<TOptions>>(
    makeSchema({
      discriminator,
      expected: values.map((item) => JSON.stringify(item)).join(' | '),
      flags: DEFAULT_FLAGS,
      kind: 'discriminatedUnion',
      map,
      options: unionOptions,
    }),
  )
}

function snapshotObjectShape<T extends ObjectShape>(shape: T): T {
  const snapshot = Object.create(null)
  Object.defineProperties(snapshot, Object.getOwnPropertyDescriptors(shape))
  return snapshot as T
}

export function createBlobSchema(): Schema<Blob | undefined, Blob> {
  return createPrimitiveSchema({
    expected: 'Blob',
    is: (value): value is Blob => value instanceof Blob,
    kind: 'blob',
    zero: () => new Blob(),
  })
}

export function createBigIntSchema(): Schema<bigint | string | undefined, bigint> {
  return createPrimitiveSchema({
    decode: (input, path) => {
      if (typeof input === 'bigint') {
        return success(input)
      }
      try {
        return success(BigInt(input as string))
      } catch {
        return failure(issue(path, 'invalid_type', 'bigint', input))
      }
    },
    encode: (value) => value.toString(),
    expected: 'bigint',
    is: (value): value is bigint | string => typeof value === 'bigint' || typeof value === 'string',
    kind: 'bigint',
    zero: () => 0n,
  }) as Schema<bigint | string | undefined, bigint>
}

export function createDateSchema(): Schema<Date | number | string | undefined, Date> {
  return createPrimitiveSchema({
    decode: (input, path) => {
      const date = input instanceof Date ? input : new Date(input as never)
      if (Number.isNaN(date.getTime())) {
        return failure(issue(path, 'invalid_type', 'Date', input))
      }
      return success(date)
    },
    encode: (value) => value.toISOString(),
    expected: 'Date',
    is: (value): value is Date | number | string => value instanceof Date || typeof value === 'string' || typeof value === 'number',
    kind: 'date',
    zero: () => new Date(0),
  }) as Schema<Date | number | string | undefined, Date>
}

export function createIntersectionSchema<A extends SchemaLike<unknown, unknown, boolean>, B extends SchemaLike<unknown, unknown, boolean>>(
  left: A,
  right: B,
): Schema<unknown, Infer<A> & Infer<B>> {
  assertSchema(left, 'intersection left')
  assertSchema(right, 'intersection right')

  return castSchema<Schema<unknown, Infer<A> & Infer<B>>>(
    makeSchema({
      flags: DEFAULT_FLAGS,
      kind: 'intersection',
      left,
      right,
    }),
  )
}

export function createFileSchema(): Schema<File | undefined, File> {
  return createPrimitiveSchema({
    expected: 'File',
    is: (value): value is File => value instanceof File,
    kind: 'file',
    zero: () => new File([], ''),
  })
}

export function createArrayBufferSchema(): Schema<ArrayBuffer | undefined, ArrayBuffer> {
  return createPrimitiveSchema({
    expected: 'ArrayBuffer',
    is: (value): value is ArrayBuffer => value instanceof ArrayBuffer,
    kind: 'arrayBuffer',
    zero: () => new ArrayBuffer(0),
  })
}

function assertObjectSchema(value: unknown, label: string): asserts value is ObjectSchema<ObjectShape> {
  assertSchema(value, label)
  if ((value as unknown as RuntimeSchema)[DEFINITION].kind !== 'object') {
    throw new TypeError(`${label} must be an object schema`)
  }
}

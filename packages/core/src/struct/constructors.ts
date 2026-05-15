import { issue } from './errors'
import { createPrimitiveSchema, DEFAULT_FLAGS, makeSchema } from './runtime'
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
  RuntimeSchema,
  Schema,
  SchemaLike,
  StringSchema,
  TupleSchema,
  UnionSchema,
} from './types'
import { describeValue, failure, isPlainObject, success } from './utils'

export function createStringSchema(): StringSchema {
  return createPrimitiveSchema({
    expected: 'string',
    is: (value): value is string => typeof value === 'string',
    kind: 'string',
    zero: () => '',
  }) as unknown as StringSchema
}

export function createNumberSchema(): NumberSchema {
  return createPrimitiveSchema({
    expected: 'number',
    is: (value): value is number => typeof value === 'number' && !Number.isNaN(value),
    kind: 'number',
    zero: () => 0,
  }) as unknown as NumberSchema
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
  return createPrimitiveSchema({
    expected: 'null',
    is: (value): value is null => value === null,
    kind: 'null',
    zero: () => null,
  }) as unknown as Schema<null, null>
}

export function createAnySchema(): Schema<unknown, any> {
  return makeSchema({
    flags: DEFAULT_FLAGS,
    kind: 'any',
  }) as unknown as Schema<unknown, any>
}

export function createUnknownSchema(): Schema<unknown, unknown> {
  return makeSchema({
    flags: DEFAULT_FLAGS,
    kind: 'unknown',
  }) as unknown as Schema<unknown, unknown>
}

export function createLiteralSchema<const T extends LiteralValue>(value: T): Schema<T | undefined, T> {
  return makeSchema({
    expected: describeValue(value),
    flags: DEFAULT_FLAGS,
    kind: 'literal',
    value,
  }) as unknown as Schema<T | undefined, T>
}

export function createEnumSchema<const T extends readonly [string, ...string[]]>(values: T): Schema<T[number] | undefined, T[number]> {
  const enumValues = [...values] as unknown as T
  return makeSchema({
    expected: enumValues.map(item => JSON.stringify(item)).join(' | '),
    flags: DEFAULT_FLAGS,
    kind: 'enum',
    values: enumValues,
  }) as unknown as Schema<T[number] | undefined, T[number]>
}

export function createObjectEnumSchema<const T extends Record<string, number | string>>(
  value: T,
): Schema<T[keyof T] | undefined, T[keyof T]> {
  const values = Object.values(value).filter((item): item is T[keyof T] => typeof item === 'number' || typeof item === 'string')

  if (values.length === 0) {
    throw new TypeError('enum schema requires at least one string or number value')
  }

  return makeSchema({
    expected: values.map(item => JSON.stringify(item)).join(' | '),
    flags: DEFAULT_FLAGS,
    kind: 'enum',
    values: values as [T[keyof T], ...T[keyof T][]],
  }) as unknown as Schema<T[keyof T] | undefined, T[keyof T]>
}

export function createArraySchema<S extends SchemaLike<any, any, boolean>>(item: S): ArraySchema<S> {
  assertSchema(item, 'array item')

  return makeSchema({
    flags: DEFAULT_FLAGS,
    item,
    kind: 'array',
  }) as unknown as ArraySchema<S>
}

export function createObjectSchema<T extends ObjectShape>(shape: T): ObjectSchema<T> {
  if (!isPlainObject(shape)) {
    throw new TypeError('object schema requires a plain object')
  }

  const declaredShape = snapshotObjectShape(shape)

  return makeSchema({
    cache: new WeakMap(),
    flags: DEFAULT_FLAGS,
    kind: 'object',
    shape: declaredShape,
  }) as unknown as ObjectSchema<T>
}

export function createRecordSchema<S extends SchemaLike<any, any, boolean>>(value: S): RecordSchema<S> {
  assertSchema(value, 'record value')

  return makeSchema({
    flags: DEFAULT_FLAGS,
    kind: 'record',
    value,
  }) as unknown as RecordSchema<S>
}

export function createTupleSchema<const T extends readonly [SchemaLike<any, any, boolean>, ...SchemaLike<any, any, boolean>[]]>(
  items: T,
): TupleSchema<T> {
  const tupleItems = [...items] as unknown as T
  for (const item of tupleItems) {
    assertSchema(item, 'tuple item')
  }

  return makeSchema({
    flags: DEFAULT_FLAGS,
    items: tupleItems,
    kind: 'tuple',
  }) as unknown as TupleSchema<T>
}

export function createUnionSchema<const T extends readonly [SchemaLike<any, any, boolean>, ...SchemaLike<any, any, boolean>[]]>(
  options: T,
): UnionSchema<T> {
  const unionOptions = [...options] as unknown as T
  for (const option of unionOptions) {
    assertSchema(option, 'or option')
  }

  return makeSchema({
    flags: DEFAULT_FLAGS,
    kind: 'or',
    options: unionOptions,
  }) as unknown as UnionSchema<T>
}

export function createDiscriminatedUnionSchema<
  const TDiscriminator extends string,
  const TOptions extends readonly [ObjectSchema<any>, ...ObjectSchema<any>[]],
>(discriminator: TDiscriminator, options: TOptions): DiscriminatedUnionSchema<TOptions> {
  const unionOptions = [...options] as unknown as TOptions
  const map = new Map<unknown, SchemaLike<any, any, boolean>>()
  const values: unknown[] = []

  for (const option of unionOptions) {
    assertSchema(option, 'discriminatedUnion option')
    const optionDef = (option as unknown as RuntimeSchema)[DEFINITION]
    /* istanbul ignore next -- type-safe: createDiscriminatedUnionSchema only accepts ObjectSchema */
    if (optionDef.kind !== 'object') {
      throw new TypeError('discriminatedUnion options must be object schemas')
    }
    const fieldSchema = optionDef.shape[discriminator] as RuntimeSchema | undefined
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

  return makeSchema({
    discriminator,
    expected: values.map(item => JSON.stringify(item)).join(' | '),
    flags: DEFAULT_FLAGS,
    kind: 'discriminatedUnion',
    map,
    options: unionOptions,
  }) as unknown as DiscriminatedUnionSchema<TOptions>
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
    encode: value => value.toString(),
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
    encode: value => value.toISOString(),
    expected: 'Date',
    is: (value): value is Date | number | string => value instanceof Date || typeof value === 'string' || typeof value === 'number',
    kind: 'date',
    zero: () => new Date(0),
  }) as Schema<Date | number | string | undefined, Date>
}

export function createIntersectionSchema<A extends SchemaLike<any, any, boolean>, B extends SchemaLike<any, any, boolean>>(
  left: A,
  right: B,
): Schema<unknown, Infer<A> & Infer<B>> {
  assertSchema(left, 'intersection left')
  assertSchema(right, 'intersection right')

  return makeSchema({
    flags: DEFAULT_FLAGS,
    kind: 'intersection',
    left,
    right,
  }) as unknown as Schema<unknown, Infer<A> & Infer<B>>
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

import { issue } from './errors'
import { castStruct, createPrimitiveStruct, DEFAULT_FLAGS, makeStruct } from './runtime'
import { assertStruct } from './shape'
import { DEFINITION } from './symbols'
import type {
  ArrayStruct,
  DiscriminatedUnionStruct,
  IntersectionInput,
  IntersectionOutput,
  LiteralValue,
  NumberStruct,
  ObjectStruct,
  ObjectShape,
  PresentValue,
  RecordStruct,
  RequestBodyCodec,
  RequestBodyDescriptor,
  RequestBodyStruct,
  RequestStruct,
  RequestShape,
  RuntimeStruct,
  Struct,
  StructLike,
  StringStruct,
  TupleStruct,
  UnionStruct,
  UnknownStruct,
} from './types'
import { describeValue, failure, isPlainObject, success } from './utils'

export function createStringStruct(): StringStruct {
  return castStruct<StringStruct>(
    createPrimitiveStruct({
      expected: 'string',
      is: (value): value is string => typeof value === 'string',
      kind: 'string',
    }),
  )
}

export function createNumberStruct(): NumberStruct {
  return castStruct<NumberStruct>(
    createPrimitiveStruct({
      expected: 'number',
      is: (value): value is number => typeof value === 'number' && !Number.isNaN(value),
      kind: 'number',
    }),
  )
}

export function createBooleanStruct(): Struct<boolean, boolean> {
  return createPrimitiveStruct({
    expected: 'boolean',
    is: (value): value is boolean => typeof value === 'boolean',
    kind: 'boolean',
  })
}

export function createNullStruct(): Struct<null, null> {
  return castStruct<Struct<null, null>>(
    createPrimitiveStruct({
      expected: 'null',
      is: (value): value is null => value === null,
      kind: 'null',
    }),
  )
}

// oxlint-disable-next-line typescript/no-explicit-any
export function createAnyStruct(): Struct<PresentValue, any> {
  // Type boundary: struct.any() intentionally models an unconstrained decoded value; any is the correct
  // representation of "no static type information" at the output boundary.
  // oxlint-disable-next-line typescript/no-explicit-any
  return castStruct<Struct<PresentValue, any>>(
    makeStruct({
      flags: DEFAULT_FLAGS,
      kind: 'any',
    }),
  )
}

export function createUnknownStruct(): UnknownStruct {
  return castStruct<UnknownStruct>(
    makeStruct({
      flags: DEFAULT_FLAGS,
      kind: 'unknown',
    }),
  )
}

export function createLiteralStruct<const T extends LiteralValue>(value: T): Struct<T, T> {
  return castStruct<Struct<T, T>>(
    makeStruct({
      expected: describeValue(value),
      flags: DEFAULT_FLAGS,
      kind: 'literal',
      value,
    }),
  )
}

export function createEnumStruct<const T extends readonly [string, ...string[]]>(values: T): Struct<T[number], T[number]> {
  const enumValues = [...values] as unknown as T
  return castStruct<Struct<T[number], T[number]>>(
    makeStruct({
      expected: enumValues.map((item) => JSON.stringify(item)).join(' | '),
      flags: DEFAULT_FLAGS,
      kind: 'enum',
      values: enumValues,
    }),
  )
}

export function createObjectEnumStruct<const T extends { [key: string]: number | string }>(value: T): Struct<T[keyof T], T[keyof T]> {
  const values = Object.values(value).filter((item): item is T[keyof T] => typeof item === 'number' || typeof item === 'string')

  if (values.length === 0) {
    throw new TypeError('enum struct requires at least one string or number value')
  }

  return castStruct<Struct<T[keyof T], T[keyof T]>>(
    makeStruct({
      expected: values.map((item) => JSON.stringify(item)).join(' | '),
      flags: DEFAULT_FLAGS,
      kind: 'enum',
      values: values as [T[keyof T], ...T[keyof T][]],
    }),
  )
}

export function createArrayStruct<S extends StructLike<unknown, unknown, boolean>>(item: S): ArrayStruct<S> {
  assertStruct(item, 'array item')

  return castStruct<ArrayStruct<S>>(
    makeStruct({
      flags: DEFAULT_FLAGS,
      item,
      kind: 'array',
    }),
  )
}

export function createObjectStruct<T extends ObjectShape>(shape: T): ObjectStruct<T> {
  if (!isPlainObject(shape)) {
    throw new TypeError('object struct requires a plain object')
  }

  const declaredShape = snapshotObjectShape(shape)

  return castStruct<ObjectStruct<T>>(
    makeStruct({
      cache: {},
      flags: DEFAULT_FLAGS,
      kind: 'object',
      shape: declaredShape,
    }),
  )
}

export function createRequestStruct<const T extends RequestShape>(shape: T): RequestStruct<T> {
  if (!isPlainObject(shape)) {
    throw new TypeError('request struct requires a plain object')
  }

  const path = shape.path
  const query = shape.query
  const headers = shape.headers
  const body = shape.body

  if (path) {
    assertObjectStruct(path, 'request.path')
  }
  if (query) {
    assertObjectStruct(query, 'request.query')
  }
  if (headers) {
    assertObjectStruct(headers, 'request.headers')
  }
  const bodyDescriptor = createRequestBodyDescriptor(body)

  return castStruct<RequestStruct<T>>(
    makeStruct({
      body,
      bodyDescriptor,
      flags: DEFAULT_FLAGS,
      headers,
      kind: 'request',
      path,
      query,
    }),
  )
}

function createRequestBodyDescriptor(body: StructLike<unknown, unknown, boolean> | undefined): RequestBodyDescriptor | undefined {
  if (!body) {
    return undefined
  }

  assertStruct(body, 'request.body')

  const definition = (body as unknown as RuntimeStruct)[DEFINITION]
  if (definition.kind === 'requestBody') {
    return {
      codec: definition.codec,
      contentType: definition.contentType,
      struct: definition.struct as unknown as RuntimeStruct,
    }
  }
  if (definition.kind === 'blob') {
    return { codec: 'blob', struct: body as unknown as RuntimeStruct }
  }
  if (definition.kind === 'arrayBuffer') {
    return { codec: 'arrayBuffer', struct: body as unknown as RuntimeStruct }
  }

  throw new TypeError('body must use a body wrapper struct')
}

export function createRequestBodyStruct<const C extends RequestBodyCodec, S extends StructLike<unknown, unknown, boolean>>(
  codec: C,
  struct: S,
  contentType?: string | null,
): RequestBodyStruct<C, S> {
  assertStruct(struct, `${codec} body`)

  return castStruct<RequestBodyStruct<C, S>>(
    makeStruct({
      codec,
      ...(contentType !== undefined ? { contentType } : {}),
      flags: DEFAULT_FLAGS,
      kind: 'requestBody',
      struct,
    }),
  )
}

export function createJsonBodyStruct<S extends StructLike<unknown, unknown, boolean>>(
  struct: S,
  options?: { contentType?: string | null },
): RequestBodyStruct<'json', S> {
  return createRequestBodyStruct('json', struct, options?.contentType)
}

export function createUrlencodedBodyStruct<T extends ObjectShape>(shape: T): RequestBodyStruct<'urlencoded', ObjectStruct<T>> {
  return createRequestBodyStruct('urlencoded', createObjectStruct(shape))
}

export function createFormDataBodyStruct<T extends ObjectShape>(shape: T): RequestBodyStruct<'formData', ObjectStruct<T>> {
  return createRequestBodyStruct('formData', createObjectStruct(shape))
}

export function createTextBodyStruct(): RequestBodyStruct<'text', StringStruct> {
  return createRequestBodyStruct('text', createStringStruct())
}

export function createRecordStruct<S extends StructLike<unknown, unknown, boolean>>(value: S): RecordStruct<S> {
  assertStruct(value, 'record value')

  return castStruct<RecordStruct<S>>(
    makeStruct({
      flags: DEFAULT_FLAGS,
      kind: 'record',
      value,
    }),
  )
}

export function createTupleStruct<
  const T extends readonly [StructLike<unknown, unknown, boolean>, ...StructLike<unknown, unknown, boolean>[]],
>(items: T): TupleStruct<T> {
  const tupleItems = [...items] as unknown as T
  for (const item of tupleItems) {
    assertStruct(item, 'tuple item')
  }

  return castStruct<TupleStruct<T>>(
    makeStruct({
      flags: DEFAULT_FLAGS,
      items: tupleItems,
      kind: 'tuple',
    }),
  )
}

export function createUnionStruct<
  const T extends readonly [StructLike<unknown, unknown, boolean>, ...StructLike<unknown, unknown, boolean>[]],
>(options: T): UnionStruct<T> {
  const unionOptions = [...options] as unknown as T
  for (const option of unionOptions) {
    assertStruct(option, 'or option')
  }

  return castStruct<UnionStruct<T>>(
    makeStruct({
      flags: DEFAULT_FLAGS,
      kind: 'or',
      options: unionOptions,
    }),
  )
}

type RequiredDiscriminatorOption<TDiscriminator extends string, TOption extends ObjectStruct<ObjectShape>> =
  TOption extends ObjectStruct<infer TShape>
    ? TDiscriminator extends keyof TShape
      ? TShape[TDiscriminator] extends StructLike<infer TInput, unknown, false>
        ? undefined extends TInput
          ? never
          : null extends TInput
            ? [TInput] extends [null]
              ? TOption
              : never
            : TOption
        : never
      : never
    : never

type RequiredDiscriminatorOptions<TDiscriminator extends string, TOptions extends readonly ObjectStruct<ObjectShape>[]> = {
  [K in keyof TOptions]: TOptions[K] extends ObjectStruct<ObjectShape> ? RequiredDiscriminatorOption<TDiscriminator, TOptions[K]> : never
}

export function createDiscriminatedUnionStruct<
  const TDiscriminator extends string,
  const TOptions extends readonly [ObjectStruct<ObjectShape>, ...ObjectStruct<ObjectShape>[]],
>(
  discriminator: TDiscriminator,
  options: TOptions & RequiredDiscriminatorOptions<TDiscriminator, TOptions>,
): DiscriminatedUnionStruct<TOptions> {
  const unionOptions = [...options] as unknown as TOptions
  const map = new Map<unknown, StructLike<unknown, unknown, boolean>>()
  const values: unknown[] = []

  for (const option of unionOptions) {
    assertStruct(option, 'discriminatedUnion option')
    const optionDef = (option as unknown as RuntimeStruct)[DEFINITION]
    /* istanbul ignore next -- type-safe: createDiscriminatedUnionStruct only accepts ObjectStruct */
    if (optionDef.kind !== 'object') {
      throw new TypeError('discriminatedUnion options must be object structs')
    }
    const fieldStruct = optionDef.shape[discriminator] as unknown as RuntimeStruct | undefined
    if (!fieldStruct) {
      throw new TypeError(`discriminatedUnion option missing discriminator field "${discriminator}"`)
    }
    const fieldDef = fieldStruct[DEFINITION]
    /* istanbul ignore next -- type-safe: discriminator is checked at compile time */
    if (fieldDef.kind !== 'literal') {
      throw new TypeError(`discriminatedUnion option discriminator "${discriminator}" must be a literal struct`)
    }
    if (fieldDef.flags.optional || (fieldDef.flags.nullable && fieldDef.value !== null)) {
      throw new TypeError(`discriminatedUnion option discriminator "${discriminator}" must be a required literal struct`)
    }
    if (map.has(fieldDef.value)) {
      throw new TypeError(`discriminatedUnion duplicate discriminator value: ${JSON.stringify(fieldDef.value)}`)
    }
    map.set(fieldDef.value, option)
    values.push(fieldDef.value)
  }

  return castStruct<DiscriminatedUnionStruct<TOptions>>(
    makeStruct({
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

export function createBlobStruct(): Struct<Blob, Blob> {
  return createPrimitiveStruct({
    expected: 'Blob',
    is: (value): value is Blob => value instanceof Blob,
    kind: 'blob',
    runtimeIs: (value): value is Blob => typeof Blob !== 'undefined' && value instanceof Blob,
  })
}

export function createBigIntStruct(): Struct<bigint | string, bigint> {
  return createPrimitiveStruct({
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
    runtimeIs: (value): value is bigint => typeof value === 'bigint',
  }) as Struct<bigint | string, bigint>
}

export function createDateStruct(): Struct<Date | number | string, Date> {
  return createPrimitiveStruct({
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
    runtimeIs: (value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()),
  }) as Struct<Date | number | string, Date>
}

export function createIntersectionStruct<
  const T extends readonly [StructLike<unknown, unknown, boolean>, ...StructLike<unknown, unknown, boolean>[]],
>(...structs: T): Struct<IntersectionInput<T>, IntersectionOutput<T>> {
  if (structs.length === 0) {
    throw new TypeError('intersection requires at least one struct')
  }

  for (const struct of structs) {
    assertStruct(struct, 'intersection item')
  }

  let current = structs[0] as unknown as RuntimeStruct
  for (let index = 1; index < structs.length; index += 1) {
    const right = structs[index] as StructLike<unknown, unknown, boolean>
    current = makeStruct({
      flags: DEFAULT_FLAGS,
      kind: 'intersection',
      left: current,
      right,
    })
  }

  return castStruct<Struct<IntersectionInput<T>, IntersectionOutput<T>>>(current)
}

export function createFileStruct(): Struct<File, File> {
  return createPrimitiveStruct({
    expected: 'File',
    is: (value): value is File => value instanceof File,
    kind: 'file',
    runtimeIs: (value): value is File => typeof File !== 'undefined' && value instanceof File,
  })
}

export function createArrayBufferStruct(): Struct<ArrayBuffer, ArrayBuffer> {
  return createPrimitiveStruct({
    expected: 'ArrayBuffer',
    is: (value): value is ArrayBuffer => value instanceof ArrayBuffer,
    kind: 'arrayBuffer',
    runtimeIs: (value): value is ArrayBuffer => typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer,
  })
}

function assertObjectStruct(value: unknown, label: string): asserts value is ObjectStruct<ObjectShape> {
  assertStruct(value, label)
  if ((value as unknown as RuntimeStruct)[DEFINITION].kind !== 'object') {
    throw new TypeError(`${label} must be an object struct`)
  }
}

import { issue } from './errors'
import { castStruct, createPrimitiveStruct, DEFAULT_FLAGS, makeStruct } from './runtime'
import { assertStruct } from './shape'
import { DEFINITION } from './symbols'
import type {
  ArrayStruct,
  DiscriminatedUnionStruct,
  IntersectionOutput,
  LiteralValue,
  NumberStruct,
  ObjectStruct,
  ObjectShape,
  RecordStruct,
  RequestBodyCodec,
  RequestBodyDescriptor,
  RequestBodyStruct,
  RequestDefinition,
  RequestStruct,
  RequestSection,
  RequestShape,
  RuntimeStruct,
  Struct,
  StructLike,
  StringStruct,
  TupleStruct,
  UnionStruct,
} from './types'
import { describeValue, failure, isPlainObject, success } from './utils'

export function createStringStruct(): StringStruct {
  return castStruct<StringStruct>(
    createPrimitiveStruct({
      expected: 'string',
      is: (value): value is string => typeof value === 'string',
      kind: 'string',
      zero: () => '',
    }),
  )
}

export function createNumberStruct(): NumberStruct {
  return castStruct<NumberStruct>(
    createPrimitiveStruct({
      expected: 'number',
      is: (value): value is number => typeof value === 'number' && !Number.isNaN(value),
      kind: 'number',
      zero: () => 0,
    }),
  )
}

export function createBooleanStruct(): Struct<boolean | undefined, boolean> {
  return createPrimitiveStruct({
    expected: 'boolean',
    is: (value): value is boolean => typeof value === 'boolean',
    kind: 'boolean',
    zero: () => false,
  })
}

export function createNullStruct(): Struct<null, null> {
  return castStruct<Struct<null, null>>(
    createPrimitiveStruct({
      expected: 'null',
      is: (value): value is null => value === null,
      kind: 'null',
      zero: () => null,
    }),
  )
}

// oxlint-disable-next-line typescript/no-explicit-any
export function createAnyStruct(): Struct<unknown, any> {
  // Type boundary: struct.any() intentionally models an unconstrained decoded value; any is the correct
  // representation of "no static type information" at the output boundary.
  // oxlint-disable-next-line typescript/no-explicit-any
  return castStruct<Struct<unknown, any>>(
    makeStruct({
      flags: DEFAULT_FLAGS,
      kind: 'any',
    }),
  )
}

export function createUnknownStruct(): Struct<unknown, unknown> {
  return castStruct<Struct<unknown, unknown>>(
    makeStruct({
      flags: DEFAULT_FLAGS,
      kind: 'unknown',
    }),
  )
}

export function createLiteralStruct<const T extends LiteralValue>(value: T): Struct<T | undefined, T> {
  return castStruct<Struct<T | undefined, T>>(
    makeStruct({
      expected: describeValue(value),
      flags: DEFAULT_FLAGS,
      kind: 'literal',
      value,
    }),
  )
}

export function createEnumStruct<const T extends readonly [string, ...string[]]>(values: T): Struct<T[number] | undefined, T[number]> {
  const enumValues = [...values] as unknown as T
  return castStruct<Struct<T[number] | undefined, T[number]>>(
    makeStruct({
      expected: enumValues.map((item) => JSON.stringify(item)).join(' | '),
      flags: DEFAULT_FLAGS,
      kind: 'enum',
      values: enumValues,
    }),
  )
}

export function createObjectEnumStruct<const T extends { [key: string]: number | string }>(
  value: T,
): Struct<T[keyof T] | undefined, T[keyof T]> {
  const values = Object.values(value).filter((item): item is T[keyof T] => typeof item === 'number' || typeof item === 'string')

  if (values.length === 0) {
    throw new TypeError('enum struct requires at least one string or number value')
  }

  return castStruct<Struct<T[keyof T] | undefined, T[keyof T]>>(
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
  const sections = createRequestSections({ body, bodyDescriptor, headers, path, query })

  return castStruct<RequestStruct<T>>(
    makeStruct({
      body,
      bodyDescriptor,
      flags: DEFAULT_FLAGS,
      headers,
      kind: 'request',
      path,
      query,
      sections,
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
    return { codec: definition.codec, struct: definition.struct as unknown as RuntimeStruct }
  }
  if (definition.kind === 'blob') {
    return { codec: 'blob', struct: body as unknown as RuntimeStruct }
  }
  if (definition.kind === 'arrayBuffer') {
    return { codec: 'arrayBuffer', struct: body as unknown as RuntimeStruct }
  }

  throw new TypeError('body must use a body wrapper struct')
}

function createRequestSections(definition: Omit<RequestDefinition, 'flags' | 'kind' | 'sections'>): readonly RequestSection[] {
  const sections: RequestSection[] = []
  if (definition.path) {
    sections.push({ key: 'path', struct: definition.path as unknown as RuntimeStruct })
  }
  if (definition.query) {
    sections.push({ key: 'query', struct: definition.query as unknown as RuntimeStruct })
  }
  if (definition.headers) {
    sections.push({ key: 'headers', struct: definition.headers as unknown as RuntimeStruct })
  }
  if (definition.body) {
    sections.push({ key: 'body', struct: definition.body as unknown as RuntimeStruct })
  }
  return Object.freeze(sections)
}

export function createRequestBodyStruct<const C extends RequestBodyCodec, S extends StructLike<unknown, unknown, boolean>>(
  codec: C,
  struct: S,
): RequestBodyStruct<C, S> {
  assertStruct(struct, `${codec} body`)

  return castStruct<RequestBodyStruct<C, S>>(
    makeStruct({
      codec,
      flags: DEFAULT_FLAGS,
      kind: 'requestBody',
      struct,
    }),
  )
}

export function createJsonBodyStruct<S extends StructLike<unknown, unknown, boolean>>(struct: S): RequestBodyStruct<'json', S> {
  return createRequestBodyStruct('json', struct)
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

export function createDiscriminatedUnionStruct<
  const TDiscriminator extends string,
  const TOptions extends readonly [ObjectStruct<ObjectShape>, ...ObjectStruct<ObjectShape>[]],
>(discriminator: TDiscriminator, options: TOptions): DiscriminatedUnionStruct<TOptions> {
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

export function createBlobStruct(): Struct<Blob | undefined, Blob> {
  return createPrimitiveStruct({
    expected: 'Blob',
    is: (value): value is Blob => value instanceof Blob,
    kind: 'blob',
    zero: () => new Blob(),
  })
}

export function createBigIntStruct(): Struct<bigint | string | undefined, bigint> {
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
    zero: () => 0n,
  }) as Struct<bigint | string | undefined, bigint>
}

export function createDateStruct(): Struct<Date | number | string | undefined, Date> {
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
    zero: () => new Date(0),
  }) as Struct<Date | number | string | undefined, Date>
}

export function createIntersectionStruct<
  const T extends readonly [StructLike<unknown, unknown, boolean>, ...StructLike<unknown, unknown, boolean>[]],
>(...structs: T): Struct<unknown, IntersectionOutput<T>> {
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

  return castStruct<Struct<unknown, IntersectionOutput<T>>>(current)
}

export function createFileStruct(): Struct<File | undefined, File> {
  return createPrimitiveStruct({
    expected: 'File',
    is: (value): value is File => value instanceof File,
    kind: 'file',
    zero: () => new File([], ''),
  })
}

export function createArrayBufferStruct(): Struct<ArrayBuffer | undefined, ArrayBuffer> {
  return createPrimitiveStruct({
    expected: 'ArrayBuffer',
    is: (value): value is ArrayBuffer => value instanceof ArrayBuffer,
    kind: 'arrayBuffer',
    zero: () => new ArrayBuffer(0),
  })
}

function assertObjectStruct(value: unknown, label: string): asserts value is ObjectStruct<ObjectShape> {
  assertStruct(value, label)
  if ((value as unknown as RuntimeStruct)[DEFINITION].kind !== 'object') {
    throw new TypeError(`${label} must be an object struct`)
  }
}

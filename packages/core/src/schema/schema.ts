const DEFINITION = Symbol('schema.definition')
const TYPES = Symbol('schema.types')
const OMIT = Symbol('schema.omit')
type Path = Array<number | string>
type ParseMode = 'field' | 'value'
type RefineResult = boolean | Error | string
type RefineCheck<T> = (value: Readonly<T>) => RefineResult | Promise<RefineResult>

export type ParseTuple<O> = [error: SchemaError | null, value: O]
type LiteralValue = boolean | null | number | string
type UnknownKeyStrategy = 'passthrough' | 'strict' | 'strip'

export interface StrictOptions {
  unknownKeys?: boolean
  missingKeys?: boolean
}

export interface StandardSchemaResultSuccess<TOutput> {
  readonly value: TOutput
}

export interface StandardSchemaIssueLike {
  readonly message?: string
  readonly path?: readonly (number | string)[]
}

export interface StandardSchemaResultFailure {
  readonly issues: readonly StandardSchemaIssueLike[]
}

export interface StandardSchemaProps<TInput, TOutput> {
  readonly types?: {
    readonly input: TInput
    readonly output: TOutput
  }
  readonly validate: (
    value: unknown,
  ) =>
    | StandardSchemaResultFailure
    | StandardSchemaResultSuccess<TOutput>
    | Promise<StandardSchemaResultFailure | StandardSchemaResultSuccess<TOutput>>
  readonly vendor?: string
  readonly version?: number
}

interface SchemaTypes<Input = unknown, Output = unknown, OptionalOut extends boolean = false> {
  input: Input
  optionalOut: OptionalOut
  output: Output
}

export interface SchemaLike<I = unknown, O = unknown, OO extends boolean = boolean> {
  readonly [TYPES]: SchemaTypes<I, O, OO>
}

type OptionalOutputSchema = SchemaLike<any, any, true>

export interface SchemaIssue {
  code: 'custom' | 'invalid_enum' | 'invalid_literal' | 'invalid_type' | 'invalid_union' | 'missing_key' | 'unrecognized_keys'
  expected: string
  message: string
  path: Path
  received: unknown
}

export interface FormattedSchemaError {
  _errors: string[]
  [key: string]: FormattedSchemaError | string[]
}

export interface FlattenedSchemaError {
  formErrors: string[]
  fieldErrors: Record<string, string[]>
}

export type ErrorMap = (issue: SchemaIssue) => string | undefined

let globalErrorMap: ErrorMap | undefined

export function setErrorMap(map: ErrorMap | undefined): void {
  globalErrorMap = map
}

export class SchemaError extends Error {
  readonly issues: SchemaIssue[]

  constructor(issues: SchemaIssue[]) {
    const first = issues[0]?.message
    super(issues.length <= 1 ? (first ?? 'Schema parse failed') : `${issues.length} schema issues: ${first}`)
    this.name = 'SchemaError'
    this.issues = issues
  }

  format(): FormattedSchemaError {
    const root: FormattedSchemaError = { _errors: [] }
    for (const item of this.issues) {
      let cursor: FormattedSchemaError = root
      for (const segment of item.path) {
        const key = String(segment)
        const existing = cursor[key]
        if (existing && !Array.isArray(existing)) {
          cursor = existing
        } else {
          const next: FormattedSchemaError = { _errors: [] }
          cursor[key] = next
          cursor = next
        }
      }
      cursor._errors.push(item.message)
    }
    return root
  }

  flatten(): FlattenedSchemaError {
    const formErrors: string[] = []
    const fieldErrors: Record<string, string[]> = {}
    for (const item of this.issues) {
      if (item.path.length === 0) {
        formErrors.push(item.message)
        continue
      }
      const key = String(item.path[0])
      ;(fieldErrors[key] ??= []).push(item.message)
    }
    return { fieldErrors, formErrors }
  }

  prettify(): string {
    if (this.issues.length === 0) {
      return 'Schema parse failed'
    }
    return this.issues
      .map(item => {
        const where = item.path.length === 0 ? '<root>' : formatPath(item.path)
        return `× ${where}: ${item.message}`
      })
      .join('\n')
  }
}

export interface SchemaMethods<I, O, OO extends boolean> {
  alias(alias: string): Schema<I, O, OO>
  default(value: Exclude<O, undefined>): Schema<I | undefined, Exclude<O, undefined>, false>
  null(): Schema<I | null, O | null, OO>
  nullish(): Schema<I | null | undefined, O | null | undefined, true>
  optional(): Schema<I | undefined, O | undefined, true>
  parse(value: unknown): ParseTuple<O>
  parseAsync(value: unknown): Promise<ParseTuple<O>>
  refine(check: RefineCheck<O>, message?: string): Schema<I, O, OO>
  transform<U, V = O>(decode: (value: O) => U, encode: (value: Awaited<U>) => V): Schema<I, Awaited<U>, OO>
  pipe<S extends SchemaLike<any, any, boolean>>(target: S): Schema<I, TypeOf<S>, OO>
  brand<B extends string | symbol>(): Schema<I, O & { readonly __brand: B }, OO>
  catch<U>(fallback: U): Schema<I, O | U, OO>
  encode(value: O): I
  readonly '~standard': StandardSchemaProps<I, O>
}

export type Schema<Input = unknown, Output = Input, OptionalOut extends boolean = false> = SchemaMethods<Input, Output, OptionalOut> &
  SchemaLike<Input, Output, OptionalOut>

export type AnySchema = Schema<any, any, boolean>

export type TypeOf<T> = T extends SchemaLike<any, any, boolean> ? T[typeof TYPES]['output'] : never
export type InputOf<T> = T extends SchemaLike<any, any, boolean> ? T[typeof TYPES]['input'] : never

export type FieldOutput<S> =
  S extends SchemaLike<any, any, boolean> ? (S extends OptionalOutputSchema ? Exclude<TypeOf<S>, undefined> : TypeOf<S>) : never

type Simplify<T> = { [K in keyof T]: T[K] } & {}

export type ObjectShape = Record<string, any>

export type ObjectInput<T extends ObjectShape> = Simplify<{
  -readonly [K in keyof T]?: InputOf<T[K]>
}>

export type ObjectOutput<T extends ObjectShape> = Simplify<
  {
    -readonly [K in keyof T as T[K] extends OptionalOutputSchema ? never : K]: FieldOutput<T[K]>
  } & {
    -readonly [K in keyof T as T[K] extends OptionalOutputSchema ? K : never]?: FieldOutput<T[K]>
  }
>

type TupleOutput<T extends readonly SchemaLike<any, any, boolean>[]> = {
  -readonly [K in keyof T]: TypeOf<T[K]>
}

type UnionOutput<T extends readonly SchemaLike<any, any, boolean>[]> = {
  [K in keyof T]: T[K] extends SchemaLike<any, any, boolean> ? TypeOf<T[K]> : never
}[number]

export interface StringSchemaMethods {
  min(n: number, message?: string): StringSchema
  max(n: number, message?: string): StringSchema
  length(n: number, message?: string): StringSchema
  regex(pattern: RegExp, message?: string): StringSchema
  email(message?: string): StringSchema
  url(message?: string): StringSchema
  uuid(message?: string): StringSchema
  startsWith(prefix: string, message?: string): StringSchema
  endsWith(suffix: string, message?: string): StringSchema
  datetime(message?: string): StringSchema
  ip(message?: string): StringSchema
  cuid(message?: string): StringSchema
  nanoid(message?: string): StringSchema
}

export type StringSchema = Schema<string | undefined, string> & StringSchemaMethods

export interface NumberSchemaMethods {
  min(n: number, message?: string): NumberSchema
  max(n: number, message?: string): NumberSchema
  gt(n: number, message?: string): NumberSchema
  gte(n: number, message?: string): NumberSchema
  lt(n: number, message?: string): NumberSchema
  lte(n: number, message?: string): NumberSchema
  int(message?: string): NumberSchema
  positive(message?: string): NumberSchema
  negative(message?: string): NumberSchema
  nonnegative(message?: string): NumberSchema
  nonpositive(message?: string): NumberSchema
  finite(message?: string): NumberSchema
  multipleOf(divisor: number, message?: string): NumberSchema
}

export type NumberSchema = Schema<number | undefined, number> & NumberSchemaMethods

export interface ArraySchemaMethods<S extends SchemaLike<any, any, boolean>> {
  min(n: number, message?: string): ArraySchema<S>
  max(n: number, message?: string): ArraySchema<S>
  length(n: number, message?: string): ArraySchema<S>
  nonempty(message?: string): ArraySchema<S>
}

export type ArraySchema<S extends SchemaLike<any, any, boolean>> = Schema<InputOf<S>[], TypeOf<S>[]> & ArraySchemaMethods<S>

type PartialField<S> =
  S extends Schema<infer I, infer O, boolean>
    ? Schema<I | undefined, O | undefined, true>
    : S extends SchemaLike<infer I, infer O, boolean>
      ? Schema<I | undefined, O | undefined, true>
      : S

type RequiredField<S> =
  S extends Schema<infer I, infer O, boolean>
    ? Schema<Exclude<I, undefined>, Exclude<O, undefined>, false>
    : S extends SchemaLike<infer I, infer O, boolean>
      ? Schema<Exclude<I, undefined>, Exclude<O, undefined>, false>
      : S

export interface ObjectSchemaMethods<T extends ObjectShape> {
  strict(options?: StrictOptions): ObjectSchema<T>
  passthrough(): ObjectSchema<T>
  strip(): ObjectSchema<T>
  pick<K extends keyof T & string>(keys: { [P in K]: true }): ObjectSchema<{ [P in K]: T[P] }>
  omit<K extends keyof T & string>(keys: { [P in K]: true }): ObjectSchema<{ [P in Exclude<keyof T, K> & string]: T[P] }>
  partial(): ObjectSchema<{ [K in keyof T]: PartialField<T[K]> }>
  required(): ObjectSchema<{ [K in keyof T]: RequiredField<T[K]> }>
  extend<U extends ObjectShape>(other: U): ObjectSchema<Simplify<Omit<T, keyof U> & U>>
  merge<U extends ObjectShape>(other: ObjectSchema<U>): ObjectSchema<Simplify<Omit<T, keyof U> & U>>
  keyof(): Schema<(keyof T & string) | undefined, keyof T & string>
}

export type ObjectSchema<T extends ObjectShape> = Schema<ObjectInput<T>, ObjectOutput<T>> & ObjectSchemaMethods<T>

export type RecordSchema<S extends SchemaLike<any, any, boolean>> = Schema<Record<string, InputOf<S>>, Record<string, FieldOutput<S>>>
export type TupleSchema<T extends readonly SchemaLike<any, any, boolean>[]> = Schema<TupleOutput<T>, TupleOutput<T>>
export type UnionSchema<T extends readonly SchemaLike<any, any, boolean>[]> = Schema<unknown, UnionOutput<T>>

type SchemaFlags = {
  alias?: string
  branded?: boolean
  defaultValue?: unknown
  hasDefault: boolean
  nullable: boolean
  optional: boolean
  hasCatch?: boolean
  catchValue?: unknown
}

type RefineStep<T> = {
  kind: 'refine'
  check: RefineCheck<T>
  message?: string
}

type TransformStep<I = any, O = any> = {
  kind: 'transform'
  decode: (value: I) => O
  encode: (value: O) => I
}

type PipeStep = {
  kind: 'pipe'
  target: SchemaLike<any, any, boolean>
}

type Refinement<T = any> = PipeStep | RefineStep<T> | TransformStep

type BaseDefinition = {
  flags: SchemaFlags
  refinements: readonly Refinement<any>[]
}

type PrimitiveKind = 'arrayBuffer' | 'bigint' | 'blob' | 'boolean' | 'date' | 'file' | 'null' | 'number' | 'string'

type PrimitiveDefinition<K extends PrimitiveKind, T> = BaseDefinition & {
  expected: string
  is: (value: unknown) => value is T
  kind: K
  zero: () => T
}

type AnyDefinition = BaseDefinition & {
  kind: 'any'
}

type UnknownDefinition = BaseDefinition & {
  kind: 'unknown'
}

type LiteralDefinition<T extends LiteralValue> = BaseDefinition & {
  expected: string
  kind: 'literal'
  value: T
}

type EnumDefinition<T extends number | string> = BaseDefinition & {
  expected: string
  kind: 'enum'
  values: readonly [T, ...T[]]
}

type ArrayDefinition = BaseDefinition & {
  kind: 'array'
  item: SchemaLike<any, any, boolean>
}

type ObjectDefinition = BaseDefinition & {
  cache: WeakMap<RuntimeSchema, ObjectShape>
  disallowMissingKeys: boolean
  kind: 'object'
  shape: ObjectShape
  unknownKeys: UnknownKeyStrategy
}

type RecordDefinition = BaseDefinition & {
  kind: 'record'
  value: SchemaLike<any, any, boolean>
}

type TupleDefinition = BaseDefinition & {
  kind: 'tuple'
  items: readonly [SchemaLike<any, any, boolean>, ...SchemaLike<any, any, boolean>[]]
}

type UnionDefinition = BaseDefinition & {
  kind: 'or'
  options: readonly [SchemaLike<any, any, boolean>, ...SchemaLike<any, any, boolean>[]]
}

type DiscriminatedUnionDefinition = BaseDefinition & {
  kind: 'discriminatedUnion'
  discriminator: string
  expected: string
  map: Map<unknown, SchemaLike<any, any, boolean>>
  options: readonly [SchemaLike<any, any, boolean>, ...SchemaLike<any, any, boolean>[]]
}

type IntersectionDefinition = BaseDefinition & {
  kind: 'intersection'
  left: SchemaLike<any, any, boolean>
  right: SchemaLike<any, any, boolean>
}

type SchemaDefinition =
  | ArrayDefinition
  | AnyDefinition
  | DiscriminatedUnionDefinition
  | EnumDefinition<any>
  | IntersectionDefinition
  | LiteralDefinition<any>
  | ObjectDefinition
  | PrimitiveDefinition<PrimitiveKind, any>
  | RecordDefinition
  | TupleDefinition
  | UnknownDefinition
  | UnionDefinition

type ParseFailure = {
  issues: SchemaIssue[]
  ok: false
}

type ParseSuccess<T> = {
  ok: true
  value: T
}

type ParseResult<T> = ParseFailure | ParseSuccess<T>

type RuntimeParseTuple = [error: SchemaError | null, value: unknown]

type RuntimeSchema = {
  readonly [DEFINITION]: SchemaDefinition
  readonly [TYPES]: SchemaTypes<unknown, unknown, boolean>
  readonly '~standard': StandardSchemaProps<unknown, unknown>
  alias(alias: string): RuntimeSchema
  default(value: unknown): RuntimeSchema
  null(): RuntimeSchema
  nullish(): RuntimeSchema
  optional(): RuntimeSchema
  parse(value: unknown): RuntimeParseTuple
  parseAsync(value: unknown): Promise<RuntimeParseTuple>
  refine(check: RefineCheck<unknown>, message?: string): RuntimeSchema
  transform(decode: (value: unknown) => unknown, encode: (value: unknown) => unknown): RuntimeSchema
  pipe(target: SchemaLike<any, any, boolean>): RuntimeSchema
  brand(): RuntimeSchema
  catch(value: unknown): RuntimeSchema
  encode(value: unknown): unknown
  strict?(options?: StrictOptions): RuntimeSchema
  passthrough?(): RuntimeSchema
  strip?(): RuntimeSchema
  pick?(keys: Record<string, true>): RuntimeSchema
  omit?(keys: Record<string, true>): RuntimeSchema
  partial?(): RuntimeSchema
  required?(): RuntimeSchema
  extend?(other: ObjectShape): RuntimeSchema
  merge?(other: RuntimeSchema): RuntimeSchema
  keyof?(): RuntimeSchema
  min?(n: number, message?: string): RuntimeSchema
  max?(n: number, message?: string): RuntimeSchema
  length?(n: number, message?: string): RuntimeSchema
  regex?(pattern: RegExp, message?: string): RuntimeSchema
  email?(message?: string): RuntimeSchema
  url?(message?: string): RuntimeSchema
  uuid?(message?: string): RuntimeSchema
  startsWith?(prefix: string, message?: string): RuntimeSchema
  endsWith?(suffix: string, message?: string): RuntimeSchema
  datetime?(message?: string): RuntimeSchema
  ip?(message?: string): RuntimeSchema
  cuid?(message?: string): RuntimeSchema
  nanoid?(message?: string): RuntimeSchema
  gt?(n: number, message?: string): RuntimeSchema
  gte?(n: number, message?: string): RuntimeSchema
  lt?(n: number, message?: string): RuntimeSchema
  lte?(n: number, message?: string): RuntimeSchema
  int?(message?: string): RuntimeSchema
  positive?(message?: string): RuntimeSchema
  negative?(message?: string): RuntimeSchema
  nonnegative?(message?: string): RuntimeSchema
  nonpositive?(message?: string): RuntimeSchema
  finite?(message?: string): RuntimeSchema
  multipleOf?(divisor: number, message?: string): RuntimeSchema
  nonempty?(message?: string): RuntimeSchema
}

export function isSchema(value: unknown): value is AnySchema {
  return typeof value === 'object' && value !== null && DEFINITION in value
}

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
    refinements: [],
  }) as unknown as Schema<unknown, any>
}

export function createUnknownSchema(): Schema<unknown, unknown> {
  return makeSchema({
    flags: DEFAULT_FLAGS,
    kind: 'unknown',
    refinements: [],
  }) as unknown as Schema<unknown, unknown>
}

export function createLiteralSchema<const T extends LiteralValue>(value: T): Schema<T | undefined, T> {
  return makeSchema({
    expected: describeValue(value),
    flags: DEFAULT_FLAGS,
    kind: 'literal',
    refinements: [],
    value,
  }) as unknown as Schema<T | undefined, T>
}

export function createEnumSchema<const T extends readonly [string, ...string[]]>(values: T): Schema<T[number] | undefined, T[number]> {
  return makeSchema({
    expected: values.map(item => JSON.stringify(item)).join(' | '),
    flags: DEFAULT_FLAGS,
    kind: 'enum',
    refinements: [],
    values,
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
    refinements: [],
    values: values as [T[keyof T], ...T[keyof T][]],
  }) as unknown as Schema<T[keyof T] | undefined, T[keyof T]>
}

export function createArraySchema<S extends SchemaLike<any, any, boolean>>(item: S): ArraySchema<S> {
  assertSchema(item, 'array item')

  return makeSchema({
    flags: DEFAULT_FLAGS,
    item,
    kind: 'array',
    refinements: [],
  }) as unknown as ArraySchema<S>
}

export function createObjectSchema<T extends ObjectShape>(shape: T): ObjectSchema<T> {
  if (!isPlainObject(shape)) {
    throw new TypeError('object schema requires a plain object')
  }

  return makeSchema({
    cache: new WeakMap(),
    disallowMissingKeys: false,
    flags: DEFAULT_FLAGS,
    kind: 'object',
    refinements: [],
    shape,
    unknownKeys: 'strip',
  }) as unknown as ObjectSchema<T>
}

export function createRecordSchema<S extends SchemaLike<any, any, boolean>>(value: S): RecordSchema<S> {
  assertSchema(value, 'record value')

  return makeSchema({
    flags: DEFAULT_FLAGS,
    kind: 'record',
    refinements: [],
    value,
  }) as unknown as RecordSchema<S>
}

export function createTupleSchema<const T extends readonly [SchemaLike<any, any, boolean>, ...SchemaLike<any, any, boolean>[]]>(
  items: T,
): TupleSchema<T> {
  for (const item of items) {
    assertSchema(item, 'tuple item')
  }

  return makeSchema({
    flags: DEFAULT_FLAGS,
    items,
    kind: 'tuple',
    refinements: [],
  }) as unknown as TupleSchema<T>
}

export function createUnionSchema<const T extends readonly [SchemaLike<any, any, boolean>, ...SchemaLike<any, any, boolean>[]]>(
  options: T,
): UnionSchema<T> {
  for (const option of options) {
    assertSchema(option, 'or option')
  }

  return makeSchema({
    flags: DEFAULT_FLAGS,
    kind: 'or',
    options,
    refinements: [],
  }) as unknown as UnionSchema<T>
}

export type DiscriminatedUnionSchema<TOptions extends readonly ObjectSchema<any>[]> = Schema<unknown, TypeOf<TOptions[number]>>

export function createDiscriminatedUnionSchema<
  const TDiscriminator extends string,
  const TOptions extends readonly [ObjectSchema<any>, ...ObjectSchema<any>[]],
>(discriminator: TDiscriminator, options: TOptions): DiscriminatedUnionSchema<TOptions> {
  const map = new Map<unknown, SchemaLike<any, any, boolean>>()
  const values: unknown[] = []

  for (const option of options) {
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
    options,
    refinements: [],
  }) as unknown as DiscriminatedUnionSchema<TOptions>
}

export function createBlobSchema(): Schema<Blob | undefined, Blob> {
  return createPrimitiveSchema({
    expected: 'Blob',
    is: (value): value is Blob => value instanceof Blob,
    kind: 'blob',
    zero: () => new Blob(),
  })
}

export function createBigIntSchema(): Schema<bigint | undefined, bigint> {
  return createPrimitiveSchema({
    expected: 'bigint',
    is: (value): value is bigint => typeof value === 'bigint' || typeof value === 'string',
    kind: 'bigint',
    zero: () => 0n,
  }).transform(
    input => {
      if (typeof input === 'bigint') return input
      try {
        return BigInt(input as string)
      } catch {
        throw new SchemaError([issue([], 'invalid_type', 'bigint', input)])
      }
    },
    value => (value as bigint).toString(),
  ) as Schema<bigint | undefined, bigint>
}

export function createDateSchema(): Schema<Date | undefined, Date> {
  return createPrimitiveSchema({
    expected: 'Date',
    is: (value): value is Date =>
      value instanceof Date || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean',
    kind: 'date',
    zero: () => new Date(0),
  }).transform(
    input => {
      if (input instanceof Date) {
        if (Number.isNaN(input.getTime())) {
          throw new SchemaError([issue([], 'invalid_type', 'Date', input)])
        }
        return input
      }
      const date = new Date(input as never)
      if (Number.isNaN(date.getTime())) {
        throw new SchemaError([issue([], 'invalid_type', 'Date', input)])
      }
      return date
    },
    value => (value as Date).toISOString(),
  ) as Schema<Date | undefined, Date>
}

export function createIntersectionSchema<A extends SchemaLike<any, any, boolean>, B extends SchemaLike<any, any, boolean>>(
  left: A,
  right: B,
): Schema<unknown, TypeOf<A> & TypeOf<B>> {
  assertSchema(left, 'intersection left')
  assertSchema(right, 'intersection right')

  return makeSchema({
    flags: DEFAULT_FLAGS,
    kind: 'intersection',
    left,
    refinements: [],
    right,
  }) as unknown as Schema<unknown, TypeOf<A> & TypeOf<B>>
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

function createPrimitiveSchema<T>(
  definition: Omit<PrimitiveDefinition<PrimitiveKind, T>, 'flags' | 'refinements'>,
): Schema<T | undefined, T> {
  return makeSchema({
    ...definition,
    flags: DEFAULT_FLAGS,
    refinements: [],
  }) as unknown as Schema<T | undefined, T>
}

const DEFAULT_FLAGS: SchemaFlags = { hasDefault: false, nullable: false, optional: false }

function makeSchema(definition: SchemaDefinition): RuntimeSchema {
  let standardCache: StandardSchemaProps<unknown, unknown> | undefined
  const schema: RuntimeSchema = {
    [DEFINITION]: definition,
    [TYPES]: undefined as never,
    get ['~standard'](): StandardSchemaProps<unknown, unknown> {
      if (!standardCache) {
        standardCache = {
          validate(value: unknown) {
            const result = parseValue(schema, value, [], 'value')
            return result.ok ? { value: result.value } : { issues: result.issues.map(item => ({ message: item.message, path: item.path })) }
          },
          vendor: 'defjs',
          version: 1,
        }
      }
      return standardCache
    },
    alias(alias: string) {
      return makeSchema({
        ...definition,
        flags: {
          ...definition.flags,
          alias,
        },
      })
    },
    default(value: unknown) {
      return makeSchema({
        ...definition,
        flags: {
          ...definition.flags,
          defaultValue: value,
          hasDefault: true,
        },
      })
    },
    null() {
      return makeSchema({
        ...definition,
        flags: {
          ...definition.flags,
          nullable: true,
        },
      })
    },
    nullish() {
      return makeSchema({
        ...definition,
        flags: {
          ...definition.flags,
          nullable: true,
          optional: true,
        },
      })
    },
    optional() {
      return makeSchema({
        ...definition,
        flags: {
          ...definition.flags,
          optional: true,
        },
      })
    },
    parse(value: unknown): RuntimeParseTuple {
      try {
        const result = parseValue(schema, value, [], 'value')
        if (result.ok) {
          return [null, result.value]
        }
        return [new SchemaError(result.issues), safeZeroValue(schema)]
      } catch (err) {
        if (err instanceof SchemaError) {
          return [err, safeZeroValue(schema)]
        }
        throw err
      }
    },
    async parseAsync(value: unknown): Promise<RuntimeParseTuple> {
      try {
        const result = await parseValueAsync(schema, value, [], 'value')
        if (result.ok) {
          return [null, result.value]
        }
        return [new SchemaError(result.issues), safeZeroValue(schema)]
      /* istanbul ignore next */
      } catch (err) {
        /* istanbul ignore next */
        if (err instanceof SchemaError) {
          /* istanbul ignore next */
          return [err, safeZeroValue(schema)]
        }
        /* istanbul ignore next */
        throw err
      }
    },
    refine(check: RefineCheck<unknown>, message?: string) {
      if (typeof check !== 'function') {
        throw new TypeError('refine() requires a validation function')
      }

      return makeSchema({
        ...definition,
        refinements: [...definition.refinements, { check, kind: 'refine', message }],
      })
    },
    transform(decode: (value: unknown) => unknown, encode: (value: unknown) => unknown) {
      if (typeof decode !== 'function' || typeof encode !== 'function') {
        throw new TypeError('transform() requires both decode and encode functions')
      }

      return makeSchema({
        ...definition,
        refinements: [...definition.refinements, { decode, encode, kind: 'transform' }],
      })
    },
    pipe(target: SchemaLike<any, any, boolean>) {
      if (!isSchema(target)) {
        throw new TypeError('pipe() requires a schema target')
      }

      return makeSchema({
        ...definition,
        refinements: [...definition.refinements, { kind: 'pipe', target }],
      })
    },
    brand() {
      // Brand is primarily a type-level phantom; flag it at runtime so introspection / dev tools can detect it.
      return makeSchema({
        ...definition,
        flags: { ...definition.flags, branded: true },
      })
    },
    catch(value: unknown) {
      return makeSchema({
        ...definition,
        flags: { ...definition.flags, catchValue: value, hasCatch: true },
      })
    },
    encode(value: unknown) {
      return encodeValue(schema, value)
    },
  }

  attachKindMethods(schema, definition)

  return schema
}

function attachKindMethods(schema: RuntimeSchema, definition: SchemaDefinition): void {
  switch (definition.kind) {
    case 'object':
      attachObjectMethods(schema, definition)
      break
    case 'string':
      attachStringMethods(schema, definition)
      break
    case 'number':
      attachNumberMethods(schema, definition)
      break
    case 'array':
      attachArrayMethods(schema, definition)
      break
  }
}

function attachObjectMethods(schema: RuntimeSchema, definition: ObjectDefinition): void {
  schema.strict = options =>
    makeSchema({
      ...definition,
      disallowMissingKeys: options?.missingKeys === true,
      unknownKeys: options?.unknownKeys === false ? definition.unknownKeys : 'strict',
    })
  schema.passthrough = () => makeSchema({ ...definition, unknownKeys: 'passthrough' })
  schema.strip = () => makeSchema({ ...definition, unknownKeys: 'strip' })

  schema.pick = keys =>
    makeSchema({
      ...definition,
      cache: new WeakMap(),
      shape: filterShape(definition.shape, key => keys[key] === true),
    })

  schema.omit = keys =>
    makeSchema({
      ...definition,
      cache: new WeakMap(),
      shape: filterShape(definition.shape, key => keys[key] !== true),
    })

  schema.partial = () =>
    makeSchema({
      ...definition,
      cache: new WeakMap(),
      shape: mapShape(definition.shape, field => (field as RuntimeSchema).optional()),
    })

  schema.required = () =>
    makeSchema({
      ...definition,
      cache: new WeakMap(),
      shape: mapShape(definition.shape, field => withRequiredFlag(field as RuntimeSchema)),
    })

  schema.extend = other =>
    makeSchema({
      ...definition,
      cache: new WeakMap(),
      shape: { ...definition.shape, ...other },
    })

  schema.merge = other => {
    const otherDef = other[DEFINITION]
    if (otherDef.kind !== 'object') {
      throw new TypeError('merge() requires another object schema')
    }
    return makeSchema({
      ...definition,
      cache: new WeakMap(),
      shape: { ...definition.shape, ...otherDef.shape },
    })
  }

  schema.keyof = () => {
    const keys = Object.keys(definition.shape)
    if (keys.length === 0) {
      throw new TypeError('keyof() requires at least one declared key')
    }
    return createEnumSchema(keys as [string, ...string[]]) as unknown as RuntimeSchema
  }
}

function filterShape(source: ObjectShape, accept: (key: string) => boolean): ObjectShape {
  const output: Record<string, SchemaLike<any, any, boolean>> = {}
  for (const key of Object.keys(source)) {
    if (accept(key)) {
      output[key] = source[key] as SchemaLike<any, any, boolean>
    }
  }
  return output
}

function mapShape(source: ObjectShape, transform: (field: SchemaLike<any, any, boolean>) => RuntimeSchema): ObjectShape {
  const output: Record<string, SchemaLike<any, any, boolean>> = {}
  for (const key of Object.keys(source)) {
    output[key] = transform(source[key] as SchemaLike<any, any, boolean>) as unknown as SchemaLike<any, any, boolean>
  }
  return output
}

function withRequiredFlag(field: RuntimeSchema): RuntimeSchema {
  const fieldDef = field[DEFINITION]
  return makeSchema({
    ...fieldDef,
    flags: { ...fieldDef.flags, optional: false },
  })
}

function withRefinement(definition: SchemaDefinition, check: RefineCheck<unknown>, message: string): RuntimeSchema {
  return makeSchema({
    ...definition,
    refinements: [...definition.refinements, { check, kind: 'refine', message }],
  })
}

const EMAIL_REGEX = /^(?!\.)(?!.*\.\.)([A-Z0-9_+-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)$/

const IPV6_REGEX = /^(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}$|^::(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4}$|^(?:[0-9a-f]{1,4}:){1,7}:$/i

const CUID_REGEX = /^c[a-z0-9]{24}$/

const NANOID_REGEX = /^[A-Za-z0-9_-]{21}$/

function isValidUrl(value: string): boolean {
  try {
    return Boolean(new URL(value))
  } catch {
    return false
  }
}

function attachStringMethods(schema: RuntimeSchema, definition: SchemaDefinition): void {
  schema.min = (n, message) =>
    withRefinement(definition, value => (value as string).length >= n, message ?? `String must contain at least ${n} character(s)`)
  schema.max = (n, message) =>
    withRefinement(definition, value => (value as string).length <= n, message ?? `String must contain at most ${n} character(s)`)
  schema.length = (n, message) =>
    withRefinement(definition, value => (value as string).length === n, message ?? `String must contain exactly ${n} character(s)`)
  schema.regex = (pattern, message) =>
    withRefinement(definition, value => pattern.test(value as string), message ?? `String must match ${pattern}`)
  schema.email = message => withRefinement(definition, value => EMAIL_REGEX.test(value as string), message ?? 'Invalid email')
  schema.url = message => withRefinement(definition, value => isValidUrl(value as string), message ?? 'Invalid url')
  schema.uuid = message => withRefinement(definition, value => UUID_REGEX.test(value as string), message ?? 'Invalid UUID')
  schema.startsWith = (prefix, message) =>
    withRefinement(definition, value => (value as string).startsWith(prefix), message ?? `String must start with "${prefix}"`)
  schema.endsWith = (suffix, message) =>
    withRefinement(definition, value => (value as string).endsWith(suffix), message ?? `String must end with "${suffix}"`)
  schema.datetime = message =>
    withRefinement(definition, value => ISO_DATETIME_REGEX.test(value as string), message ?? 'Invalid ISO datetime')
  schema.ip = message =>
    withRefinement(
      definition,
      value => IPV4_REGEX.test(value as string) || IPV6_REGEX.test(value as string),
      message ?? 'Invalid IP address',
    )
  schema.cuid = message => withRefinement(definition, value => CUID_REGEX.test(value as string), message ?? 'Invalid CUID')
  schema.nanoid = message => withRefinement(definition, value => NANOID_REGEX.test(value as string), message ?? 'Invalid nanoid')
}

function attachNumberMethods(schema: RuntimeSchema, definition: SchemaDefinition): void {
  const minImpl = (n: number, message?: string) =>
    withRefinement(definition, value => (value as number) >= n, message ?? `Number must be greater than or equal to ${n}`)
  const maxImpl = (n: number, message?: string) =>
    withRefinement(definition, value => (value as number) <= n, message ?? `Number must be less than or equal to ${n}`)

  schema.min = minImpl
  schema.gte = minImpl
  schema.max = maxImpl
  schema.lte = maxImpl
  schema.gt = (n, message) => withRefinement(definition, value => (value as number) > n, message ?? `Number must be greater than ${n}`)
  schema.lt = (n, message) => withRefinement(definition, value => (value as number) < n, message ?? `Number must be less than ${n}`)
  schema.int = message => withRefinement(definition, value => Number.isInteger(value), message ?? 'Number must be an integer')
  schema.positive = message => withRefinement(definition, value => (value as number) > 0, message ?? 'Number must be positive')
  schema.negative = message => withRefinement(definition, value => (value as number) < 0, message ?? 'Number must be negative')
  schema.nonnegative = message => withRefinement(definition, value => (value as number) >= 0, message ?? 'Number must be non-negative')
  schema.nonpositive = message => withRefinement(definition, value => (value as number) <= 0, message ?? 'Number must be non-positive')
  schema.finite = message => withRefinement(definition, value => Number.isFinite(value), message ?? 'Number must be finite')
  schema.multipleOf = (divisor, message) =>
    withRefinement(definition, value => (value as number) % divisor === 0, message ?? `Number must be a multiple of ${divisor}`)
}

function attachArrayMethods(schema: RuntimeSchema, definition: SchemaDefinition): void {
  schema.min = (n, message) =>
    withRefinement(definition, value => (value as unknown[]).length >= n, message ?? `Array must contain at least ${n} item(s)`)
  schema.max = (n, message) =>
    withRefinement(definition, value => (value as unknown[]).length <= n, message ?? `Array must contain at most ${n} item(s)`)
  schema.length = (n, message) =>
    withRefinement(definition, value => (value as unknown[]).length === n, message ?? `Array must contain exactly ${n} item(s)`)
  schema.nonempty = message => withRefinement(definition, value => (value as unknown[]).length > 0, message ?? 'Array must not be empty')
}

function parseValue(schema: RuntimeSchema, input: unknown, path: Path, mode: ParseMode): ParseResult<unknown> {
  const result = dispatchParseValue(schema, input, path, mode)
  return applyCatch(schema, result)
}

function dispatchParseValue(schema: RuntimeSchema, input: unknown, path: Path, mode: ParseMode): ParseResult<unknown> {
  const definition = schema[DEFINITION]

  if (input === undefined) {
    return parseMissingValue(schema, path, mode)
  }

  if (input === null) {
    if (definition.kind === 'null' || definition.flags.nullable) {
      return applyRefinements(schema, null, path)
    }

    return parseMissingValue(schema, path, mode)
  }

  switch (definition.kind) {
    case 'any':
    case 'unknown':
      return applyRefinements(schema, input, path)

    case 'array':
      return parseArrayValue(schema, definition, input, path)

    case 'arrayBuffer':
    case 'bigint':
    case 'blob':
    case 'boolean':
    case 'date':
    case 'file':
    case 'null':
    case 'number':
    case 'string':
      return parsePrimitiveValue(schema, definition, input, path)

    case 'enum':
      return parseEnumValue(schema, definition, input, path)

    case 'intersection':
      return parseIntersectionValue(schema, definition, input, path)

    case 'literal':
      return parseLiteralValue(schema, definition, input, path)

    case 'object':
      return parseObjectValue(schema, definition, input, path)

    case 'or':
      return parseUnionValue(schema, definition, input, path)

    case 'discriminatedUnion':
      return parseDiscriminatedUnionValue(schema, definition, input, path)

    case 'record':
      return parseRecordValue(schema, definition, input, path)

    case 'tuple':
      return parseTupleValue(schema, definition, input, path)
  }
}

function parseMissingValue(schema: RuntimeSchema, path: Path, mode: ParseMode): ParseResult<unknown> {
  const definition = schema[DEFINITION]

  if (definition.flags.hasDefault) {
    return applyRefinements(schema, cloneValue(definition.flags.defaultValue), path)
  }

  if (mode === 'field' && definition.flags.optional) {
    return success(OMIT)
  }

  if (definition.flags.optional) {
    return applyRefinements(schema, undefined, path)
  }

  if (definition.flags.nullable || definition.kind === 'null') {
    return applyRefinements(schema, null, path)
  }

  return applyRefinements(schema, buildZeroValue(schema, path), path)
}

function parsePrimitiveValue(
  schema: RuntimeSchema,
  definition: PrimitiveDefinition<PrimitiveKind, any>,
  input: unknown,
  path: Path,
): ParseResult<unknown> {
  if (!definition.is(input)) {
    return failure(issue(path, 'invalid_type', definition.expected, input))
  }

  return applyRefinements(schema, input, path)
}

function parseEnumValue(schema: RuntimeSchema, definition: EnumDefinition<any>, input: unknown, path: Path): ParseResult<unknown> {
  if (!definition.values.includes(input)) {
    return failure(issue(path, 'invalid_enum', definition.expected, input))
  }

  return applyRefinements(schema, input, path)
}

function parseLiteralValue(schema: RuntimeSchema, definition: LiteralDefinition<any>, input: unknown, path: Path): ParseResult<unknown> {
  if (!Object.is(input, definition.value)) {
    return failure(issue(path, 'invalid_literal', definition.expected, input))
  }

  return applyRefinements(schema, input, path)
}

function parseArrayValue(schema: RuntimeSchema, definition: ArrayDefinition, input: unknown, path: Path): ParseResult<unknown[]> {
  if (!Array.isArray(input)) {
    return failure(issue(path, 'invalid_type', 'array', input))
  }

  const output: unknown[] = []
  const issues: SchemaIssue[] = []

  for (let index = 0; index < input.length; index += 1) {
    const result = parseValue(definition.item as RuntimeSchema, input[index], [...path, index], 'value')
    if (!result.ok) {
      issues.push(...result.issues)
      continue
    }

    output[index] = result.value
  }

  if (issues.length > 0) {
    return failure(...issues)
  }

  return applyRefinements(schema, output, path) as ParseResult<unknown[]>
}

function parseObjectValue(
  schema: RuntimeSchema,
  definition: ObjectDefinition,
  input: unknown,
  path: Path,
): ParseResult<Record<string, unknown>> {
  if (!isPlainObject(input)) {
    return failure(issue(path, 'invalid_type', 'object', input))
  }

  const shape = resolveObjectShape(schema, definition)
  const output: Record<string, unknown> = Object.create(null)
  const issues: SchemaIssue[] = []
  const declared = new Set<string>()

  for (const [key, itemSchema] of Object.entries(shape)) {
    const itemDefinition = (itemSchema as RuntimeSchema)[DEFINITION]
    const inputKey = itemDefinition.flags.alias ?? key
    declared.add(inputKey)

    if (definition.disallowMissingKeys && !(inputKey in input) && isFieldRequired(itemDefinition)) {
      issues.push(issue([...path, key], 'missing_key', 'declared field', undefined, `Missing key "${key}"`))
      continue
    }

    const result = parseValue(itemSchema as RuntimeSchema, input[inputKey], [...path, key], 'field')

    if (!result.ok) {
      issues.push(...result.issues)
      continue
    }

    if (result.value !== OMIT) {
      output[key] = result.value
    }
  }

  if (definition.unknownKeys !== 'strip') {
    for (const inputKey of Object.keys(input)) {
      if (declared.has(inputKey)) {
        continue
      }
      if (definition.unknownKeys === 'strict') {
        issues.push(issue([...path, inputKey], 'unrecognized_keys', 'declared field', input[inputKey], `Unrecognized key "${inputKey}"`))
      }
      if (definition.unknownKeys === 'passthrough') {
        output[inputKey] = input[inputKey]
      }
    }
  }

  if (issues.length > 0) {
    return failure(...issues)
  }

  return applyRefinements(schema, output, path) as ParseResult<Record<string, unknown>>
}

function isFieldRequired(itemDefinition: SchemaDefinition): boolean {
  return !itemDefinition.flags.hasDefault && !itemDefinition.flags.optional && !itemDefinition.flags.nullable
}

function parseRecordValue(
  schema: RuntimeSchema,
  definition: RecordDefinition,
  input: unknown,
  path: Path,
): ParseResult<Record<string, unknown>> {
  if (!isPlainObject(input)) {
    return failure(issue(path, 'invalid_type', 'record', input))
  }

  const output: Record<string, unknown> = Object.create(null)
  const issues: SchemaIssue[] = []

  for (const [key, value] of Object.entries(input)) {
    const result = parseValue(definition.value as RuntimeSchema, value, [...path, key], 'field')

    if (!result.ok) {
      issues.push(...result.issues)
      continue
    }

    if (result.value !== OMIT) {
      output[key] = result.value
    }
  }

  if (issues.length > 0) {
    return failure(...issues)
  }

  return applyRefinements(schema, output, path) as ParseResult<Record<string, unknown>>
}

function parseTupleValue(schema: RuntimeSchema, definition: TupleDefinition, input: unknown, path: Path): ParseResult<unknown[]> {
  if (!Array.isArray(input)) {
    return failure(issue(path, 'invalid_type', 'tuple', input))
  }

  const output: unknown[] = []
  const issues: SchemaIssue[] = []

  for (let index = 0; index < definition.items.length; index += 1) {
    const itemSchema = definition.items[index]
    const result = parseValue(itemSchema as RuntimeSchema, input[index], [...path, index], 'value')

    if (!result.ok) {
      issues.push(...result.issues)
      continue
    }

    output[index] = result.value
  }

  if (issues.length > 0) {
    return failure(...issues)
  }

  return applyRefinements(schema, output, path) as ParseResult<unknown[]>
}

function parseUnionValue(schema: RuntimeSchema, definition: UnionDefinition, input: unknown, path: Path): ParseResult<unknown> {
  for (const option of definition.options) {
    const result = parseValue(option as RuntimeSchema, input, path, 'value')
    if (result.ok) {
      return applyRefinements(schema, result.value, path)
    }
  }

  return failure(issue(path, 'invalid_union', expectedType(definition), input))
}

function parseDiscriminatedUnionValue(
  schema: RuntimeSchema,
  definition: DiscriminatedUnionDefinition,
  input: unknown,
  path: Path,
): ParseResult<unknown> {
  if (!isPlainObject(input)) {
    return failure(issue(path, 'invalid_type', 'object', input))
  }

  const value = input[definition.discriminator]
  const target = definition.map.get(value)
  if (!target) {
    return failure(issue([...path, definition.discriminator], 'invalid_union', definition.expected, value))
  }

  const result = parseValue(target as RuntimeSchema, input, path, 'value')
  if (!result.ok) {
    return result
  }

  return applyRefinements(schema, result.value, path)
}

function parseIntersectionValue(
  schema: RuntimeSchema,
  definition: IntersectionDefinition,
  input: unknown,
  path: Path,
): ParseResult<unknown> {
  const leftResult = parseValue(definition.left as RuntimeSchema, input, path, 'value')
  if (!leftResult.ok) {
    return leftResult
  }

  const rightResult = parseValue(definition.right as RuntimeSchema, input, path, 'value')
  if (!rightResult.ok) {
    return rightResult
  }

  const merged =
    isPlainObject(leftResult.value) && isPlainObject(rightResult.value) ? { ...leftResult.value, ...rightResult.value } : rightResult.value

  return applyRefinements(schema, merged, path)
}

function applyCatch(schema: RuntimeSchema, result: ParseResult<unknown>): ParseResult<unknown> {
  if (!result.ok && schema[DEFINITION].flags.hasCatch) {
    return success(cloneValue(schema[DEFINITION].flags.catchValue))
  }
  return result
}

async function parseValueAsync(schema: RuntimeSchema, input: unknown, path: Path, mode: ParseMode): Promise<ParseResult<unknown>> {
  const result = await dispatchParseValueAsync(schema, input, path, mode)
  return applyCatch(schema, result)
}

async function dispatchParseValueAsync(schema: RuntimeSchema, input: unknown, path: Path, mode: ParseMode): Promise<ParseResult<unknown>> {
  const definition = schema[DEFINITION]

  if (input === undefined) {
    return parseMissingValueAsync(schema, path, mode)
  }

  if (input === null) {
    if (definition.kind === 'null' || definition.flags.nullable) {
      return applyRefinementsAsync(schema, null, path)
    }

    return parseMissingValueAsync(schema, path, mode)
  }

  switch (definition.kind) {
    case 'any':
    case 'unknown':
      return applyRefinementsAsync(schema, input, path)

    case 'array':
      return parseArrayValueAsync(schema, definition, input, path)

    case 'arrayBuffer':
    case 'bigint':
    case 'blob':
    case 'boolean':
    case 'date':
    case 'file':
    case 'null':
    case 'number':
    case 'string':
      return parsePrimitiveValueAsync(schema, definition, input, path)

    case 'enum':
      return parseEnumValueAsync(schema, definition, input, path)

    case 'intersection':
      return parseIntersectionValueAsync(schema, definition, input, path)

    case 'literal':
      return parseLiteralValueAsync(schema, definition, input, path)

    case 'object':
      return parseObjectValueAsync(schema, definition, input, path)

    case 'or':
      return parseUnionValueAsync(schema, definition, input, path)

    case 'discriminatedUnion':
      return parseDiscriminatedUnionValueAsync(schema, definition, input, path)

    case 'record':
      return parseRecordValueAsync(schema, definition, input, path)

    case 'tuple':
      return parseTupleValueAsync(schema, definition, input, path)
  }
}

async function parseMissingValueAsync(schema: RuntimeSchema, path: Path, mode: ParseMode): Promise<ParseResult<unknown>> {
  const definition = schema[DEFINITION]

  if (definition.flags.hasDefault) {
    return applyRefinementsAsync(schema, cloneValue(definition.flags.defaultValue), path)
  }

  if (mode === 'field' && definition.flags.optional) {
    return success(OMIT)
  }

  if (definition.flags.optional) {
    return applyRefinementsAsync(schema, undefined, path)
  }

  if (definition.flags.nullable || definition.kind === 'null') {
    return applyRefinementsAsync(schema, null, path)
  }

  return applyRefinementsAsync(schema, buildZeroValue(schema, path), path)
}

async function parsePrimitiveValueAsync(
  schema: RuntimeSchema,
  definition: PrimitiveDefinition<PrimitiveKind, any>,
  input: unknown,
  path: Path,
): Promise<ParseResult<unknown>> {
  if (!definition.is(input)) {
    return failure(issue(path, 'invalid_type', definition.expected, input))
  }

  return applyRefinementsAsync(schema, input, path)
}

async function parseEnumValueAsync(
  schema: RuntimeSchema,
  definition: EnumDefinition<any>,
  input: unknown,
  path: Path,
): Promise<ParseResult<unknown>> {
  if (!definition.values.includes(input)) {
    return failure(issue(path, 'invalid_enum', definition.expected, input))
  }

  return applyRefinementsAsync(schema, input, path)
}

async function parseLiteralValueAsync(
  schema: RuntimeSchema,
  definition: LiteralDefinition<any>,
  input: unknown,
  path: Path,
): Promise<ParseResult<unknown>> {
  if (!Object.is(input, definition.value)) {
    return failure(issue(path, 'invalid_literal', definition.expected, input))
  }

  return applyRefinementsAsync(schema, input, path)
}

async function parseArrayValueAsync(
  schema: RuntimeSchema,
  definition: ArrayDefinition,
  input: unknown,
  path: Path,
): Promise<ParseResult<unknown[]>> {
  if (!Array.isArray(input)) {
    return failure(issue(path, 'invalid_type', 'array', input))
  }

  const output: unknown[] = []
  const issues: SchemaIssue[] = []

  for (let index = 0; index < input.length; index += 1) {
    const result = await parseValueAsync(definition.item as RuntimeSchema, input[index], [...path, index], 'value')
    if (!result.ok) {
      issues.push(...result.issues)
      continue
    }

    output[index] = result.value
  }

  if (issues.length > 0) {
    return failure(...issues)
  }

  return applyRefinementsAsync(schema, output, path) as Promise<ParseResult<unknown[]>>
}

async function parseObjectValueAsync(
  schema: RuntimeSchema,
  definition: ObjectDefinition,
  input: unknown,
  path: Path,
): Promise<ParseResult<Record<string, unknown>>> {
  if (!isPlainObject(input)) {
    return failure(issue(path, 'invalid_type', 'object', input))
  }

  const shape = resolveObjectShape(schema, definition)
  const output: Record<string, unknown> = Object.create(null)
  const issues: SchemaIssue[] = []
  const declared = new Set<string>()

  for (const [key, itemSchema] of Object.entries(shape)) {
    const itemDefinition = (itemSchema as RuntimeSchema)[DEFINITION]
    const inputKey = itemDefinition.flags.alias ?? key
    declared.add(inputKey)

    if (definition.disallowMissingKeys && !(inputKey in input) && isFieldRequired(itemDefinition)) {
      issues.push(issue([...path, key], 'missing_key', 'declared field', undefined, `Missing key "${key}"`))
      continue
    }

    const result = await parseValueAsync(itemSchema as RuntimeSchema, input[inputKey], [...path, key], 'field')

    if (!result.ok) {
      issues.push(...result.issues)
      continue
    }

    if (result.value !== OMIT) {
      output[key] = result.value
    }
  }

  if (definition.unknownKeys !== 'strip') {
    for (const inputKey of Object.keys(input)) {
      if (declared.has(inputKey)) {
        continue
      }
      if (definition.unknownKeys === 'strict') {
        issues.push(issue([...path, inputKey], 'unrecognized_keys', 'declared field', input[inputKey], `Unrecognized key "${inputKey}"`))
      }
      if (definition.unknownKeys === 'passthrough') {
        output[inputKey] = input[inputKey]
      }
    }
  }

  if (issues.length > 0) {
    return failure(...issues)
  }

  return applyRefinementsAsync(schema, output, path) as Promise<ParseResult<Record<string, unknown>>>
}

async function parseRecordValueAsync(
  schema: RuntimeSchema,
  definition: RecordDefinition,
  input: unknown,
  path: Path,
): Promise<ParseResult<Record<string, unknown>>> {
  if (!isPlainObject(input)) {
    return failure(issue(path, 'invalid_type', 'record', input))
  }

  const output: Record<string, unknown> = Object.create(null)
  const issues: SchemaIssue[] = []

  for (const [key, value] of Object.entries(input)) {
    const result = await parseValueAsync(definition.value as RuntimeSchema, value, [...path, key], 'field')

    if (!result.ok) {
      issues.push(...result.issues)
      continue
    }

    if (result.value !== OMIT) {
      output[key] = result.value
    }
  }

  if (issues.length > 0) {
    return failure(...issues)
  }

  return applyRefinementsAsync(schema, output, path) as Promise<ParseResult<Record<string, unknown>>>
}

async function parseTupleValueAsync(
  schema: RuntimeSchema,
  definition: TupleDefinition,
  input: unknown,
  path: Path,
): Promise<ParseResult<unknown[]>> {
  if (!Array.isArray(input)) {
    return failure(issue(path, 'invalid_type', 'tuple', input))
  }

  const output: unknown[] = []
  const issues: SchemaIssue[] = []

  for (let index = 0; index < definition.items.length; index += 1) {
    const itemSchema = definition.items[index]
    const result = await parseValueAsync(itemSchema as RuntimeSchema, input[index], [...path, index], 'value')

    if (!result.ok) {
      issues.push(...result.issues)
      continue
    }

    output[index] = result.value
  }

  if (issues.length > 0) {
    return failure(...issues)
  }

  return applyRefinementsAsync(schema, output, path) as Promise<ParseResult<unknown[]>>
}

async function parseUnionValueAsync(
  schema: RuntimeSchema,
  definition: UnionDefinition,
  input: unknown,
  path: Path,
): Promise<ParseResult<unknown>> {
  for (const option of definition.options) {
    const result = await parseValueAsync(option as RuntimeSchema, input, path, 'value')
    if (result.ok) {
      return applyRefinementsAsync(schema, result.value, path)
    }
  }

  return failure(issue(path, 'invalid_union', expectedType(definition), input))
}

async function parseDiscriminatedUnionValueAsync(
  schema: RuntimeSchema,
  definition: DiscriminatedUnionDefinition,
  input: unknown,
  path: Path,
): Promise<ParseResult<unknown>> {
  if (!isPlainObject(input)) {
    return failure(issue(path, 'invalid_type', 'object', input))
  }

  const value = input[definition.discriminator]
  const target = definition.map.get(value)
  if (!target) {
    return failure(issue([...path, definition.discriminator], 'invalid_union', definition.expected, value))
  }

  const result = await parseValueAsync(target as RuntimeSchema, input, path, 'value')
  if (!result.ok) {
    return result
  }

  return applyRefinementsAsync(schema, result.value, path)
}

async function parseIntersectionValueAsync(
  schema: RuntimeSchema,
  definition: IntersectionDefinition,
  input: unknown,
  path: Path,
): Promise<ParseResult<unknown>> {
  const leftResult = await parseValueAsync(definition.left as RuntimeSchema, input, path, 'value')
  if (!leftResult.ok) {
    return leftResult
  }

  const rightResult = await parseValueAsync(definition.right as RuntimeSchema, input, path, 'value')
  if (!rightResult.ok) {
    return rightResult
  }

  /* istanbul ignore next -- source-map skew: async cond-expr branch misaligned */
  const merged =
    isPlainObject(leftResult.value) && isPlainObject(rightResult.value) ? { ...leftResult.value, ...rightResult.value } : rightResult.value

  return applyRefinementsAsync(schema, merged, path)
}

function applyRefinements(schema: RuntimeSchema, value: unknown, path: Path): ParseResult<unknown> {
  const definition = schema[DEFINITION]
  const { refinements } = definition

  if (refinements.length === 0) {
    return success(value)
  }

  const issues: SchemaIssue[] = []
  let current = value

  for (const step of refinements) {
    if (step.kind === 'refine') {
      const result = step.check(current as never)

      if (isPromiseLike(result)) {
        throw new SchemaError([
          issue(path, 'custom', expectedType(definition), current, 'Async refinement detected; use parseAsync()'),
        ])
      }

      collectRefineIssue(result, step.message, definition, current, path, issues)
      continue
    }

    if (issues.length > 0) {
      return failure(...issues)
    }

    if (step.kind === 'transform') {
      try {
        current = step.decode(current)
      } catch (err) {
        if (err instanceof SchemaError) {
          return failure(...err.issues.map(it => ({ ...it, path: [...path, ...it.path] })))
        }
        return failure(issue(path, 'invalid_type', expectedType(definition), current, err instanceof Error ? err.message : undefined))
      }
      continue
    }

    const result = parseValue(step.target as RuntimeSchema, current, path, 'value')
    if (!result.ok) {
      return failure(...result.issues)
    }
    current = result.value
  }

  return issues.length > 0 ? failure(...issues) : success(current)
}

async function applyRefinementsAsync(schema: RuntimeSchema, value: unknown, path: Path): Promise<ParseResult<unknown>> {
  const definition = schema[DEFINITION]
  const { refinements } = definition

  if (refinements.length === 0) {
    return success(value)
  }

  const issues: SchemaIssue[] = []
  let current = value

  for (const step of refinements) {
    if (step.kind === 'refine') {
      const result = await Promise.resolve(step.check(current as never))
      collectRefineIssue(result, step.message, definition, current, path, issues)
      continue
    }

    if (issues.length > 0) {
      return failure(...issues)
    }

    if (step.kind === 'transform') {
      try {
        current = await Promise.resolve(step.decode(current))
      } catch (err) {
        if (err instanceof SchemaError) {
          return failure(...err.issues.map(it => ({ ...it, path: [...path, ...it.path] })))
        }
        return failure(issue(path, 'invalid_type', expectedType(definition), current, err instanceof Error ? err.message : undefined))
      }
      continue
    }

    const result = await parseValueAsync(step.target as RuntimeSchema, current, path, 'value')
    if (!result.ok) {
      return failure(...result.issues)
    }
    /* istanbul ignore next -- source-map skew: async branch mapped to wrong line */
    current = result.value
  }

  return issues.length > 0 ? failure(...issues) : success(current)
}

function collectRefineIssue(
  result: RefineResult,
  message: string | undefined,
  definition: SchemaDefinition,
  value: unknown,
  path: Path,
  issues: SchemaIssue[],
): void {
  if (result === true) {
    return
  }

  if (result === false) {
    issues.push(issue(path, 'custom', expectedType(definition), value, message))
    return
  }

  if (typeof result === 'string') {
    issues.push(issue(path, 'custom', expectedType(definition), value, result))
    return
  }

  /* istanbul ignore next -- defensive: RefineResult type excludes non-Error */
  if (result instanceof Error) {
    issues.push(issue(path, 'custom', expectedType(definition), value, result.message))
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return value !== null && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function'
}

function safeZeroValue(schema: RuntimeSchema): unknown {
  try {
    return buildZeroValue(schema, [])
  } catch (err) {
    /* istanbul ignore next -- defensive: buildZeroValue only throws SchemaError */
    if (err instanceof SchemaError) return undefined
    /* istanbul ignore next -- defensive: buildZeroValue only throws SchemaError */
    throw err
  }
}

function buildZeroValue(schema: RuntimeSchema, path: Path): unknown {
  const definition = schema[DEFINITION]

  switch (definition.kind) {
    case 'any':
    case 'unknown':
      return undefined

    case 'array':
      return []

    case 'arrayBuffer':
    case 'bigint':
    case 'blob':
    case 'boolean':
    case 'date':
    case 'file':
    case 'null':
    case 'number':
    case 'string':
      return definition.zero()

    case 'enum':
      return cloneValue(definition.values[0])

    case 'intersection': {
      const result = parseValue(definition.right as RuntimeSchema, undefined, path, 'value')
      /* istanbul ignore next -- source-map skew: if branch mapped to wrong line */
      if (!result.ok) {
        throw new SchemaError(result.issues)
      }

      return result.value
    }


    case 'literal':
      return cloneValue(definition.value)

    case 'object': {
      const output: Record<string, unknown> = Object.create(null)
      const shape = resolveObjectShape(schema, definition)

      for (const [key, itemSchema] of Object.entries(shape)) {
        const result = parseValue(itemSchema as RuntimeSchema, undefined, [...path, key], 'field')
        if (!result.ok) {
          throw new SchemaError(result.issues)
        }

        if (result.value !== OMIT) {
          output[key] = result.value
        }
      }

      return output
    }

    case 'or': {
      const result = parseValue(definition.options[0] as RuntimeSchema, undefined, path, 'value')
      if (!result.ok) {
        throw new SchemaError(result.issues)
      }

      return result.value
    }

    case 'discriminatedUnion': {
      const result = parseValue(definition.options[0] as RuntimeSchema, undefined, path, 'value')
      /* istanbul ignore next -- source-map skew: if branch mapped to wrong line */
      if (!result.ok) {
        throw new SchemaError(result.issues)
      }

      return result.value
    }

    case 'record':
      return {}

    case 'tuple': {
      const output: unknown[] = []

      for (let index = 0; index < definition.items.length; index += 1) {
        const result = parseValue(definition.items[index] as RuntimeSchema, undefined, [...path, index], 'value')
        if (!result.ok) {
          throw new SchemaError(result.issues)
        }

        output[index] = result.value
      }

      return output
    }
  }
}

function encodeValue(schema: RuntimeSchema, value: unknown): unknown {
  const definition = schema[DEFINITION]
  const { refinements } = definition

  let current = value
  for (let i = refinements.length - 1; i >= 0; i -= 1) {
    const step = refinements[i]
    /* istanbul ignore next -- defensive: refinements array never contains falsy */
    if (!step) continue
    if (step.kind === 'transform') {
      current = step.encode(current)
    } else if (step.kind === 'pipe') {
      current = encodeValue(step.target as RuntimeSchema, current)
    }
  }

  switch (definition.kind) {
    case 'any':
    case 'unknown':
    case 'arrayBuffer':
    case 'bigint':
    case 'blob':
    case 'boolean':
    case 'date':
    case 'file':
    case 'null':
    case 'number':
    case 'string':
    case 'enum':
    case 'literal':
      return current

    case 'array':
      return Array.isArray(current) ? current.map(item => encodeValue(definition.item as RuntimeSchema, item)) : current

    case 'tuple':
      return Array.isArray(current)
        ? current.map((item, index) => (index < definition.items.length ? encodeValue(definition.items[index] as RuntimeSchema, item) : item))
        : current

    case 'record': {
      if (!isPlainObject(current)) {
        return current
      }
      const output: Record<string, unknown> = Object.create(null)
      for (const [key, entry] of Object.entries(current)) {
        output[key] = encodeValue(definition.value as RuntimeSchema, entry)
      }
      return output
    }

    case 'object': {
      if (!isPlainObject(current)) {
        return current
      }
      const output: Record<string, unknown> = Object.create(null)
      const shape = resolveObjectShape(schema, definition)
      for (const [key, fieldSchema] of Object.entries(shape)) {
        if (!(key in current)) {
          continue
        }
        const fieldDef = (fieldSchema as RuntimeSchema)[DEFINITION]
        const outputKey = fieldDef.flags.alias ?? key
        output[outputKey] = encodeValue(fieldSchema as RuntimeSchema, current[key])
      }
      return output
    }

    case 'or': {
      for (const opt of definition.options) {
        const optDef = (opt as RuntimeSchema)[DEFINITION]
        if (matchesDefinition(optDef, current)) {
          return encodeValue(opt as RuntimeSchema, current)
        }
      }
      return current
    }

    case 'discriminatedUnion': {
      if (isPlainObject(current)) {
        const matched = definition.map.get((current as Record<string, unknown>)[definition.discriminator])
        if (matched) {
          return encodeValue(matched as RuntimeSchema, current)
        }
      }
      return current
    }

    case 'intersection':
      return encodeValue(definition.right as RuntimeSchema, current)
  }
}

// Best-effort runtime type guard used by encode() to route union / intersection / discriminatedUnion to the right branch.
// NOTE: this uses strict native type checks instead of `definition.is`, because some primitive `is` predicates
// intentionally widen to accept wire forms(e.g. `schema.date().is` accepts string/number for transform decode).
// Encode runs *after* parse — by this point the value is in its runtime form, so we want the strict native check.
function matchesDefinition(definition: SchemaDefinition, value: unknown): boolean {
  switch (definition.kind) {
    case 'any':
    case 'unknown':
      return true
    case 'null':
      return value === null
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && !Number.isNaN(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'bigint':
      return typeof value === 'bigint'
    case 'date':
      return value instanceof Date && !Number.isNaN(value.getTime())
    case 'blob':
      return typeof Blob !== 'undefined' && value instanceof Blob
    case 'file':
      return typeof File !== 'undefined' && value instanceof File
    case 'arrayBuffer':
      return value instanceof ArrayBuffer
    case 'literal':
      return Object.is(value, definition.value)
    case 'enum':
      return definition.values.includes(value as never)
    case 'array':
      return Array.isArray(value)
    case 'tuple':
      return Array.isArray(value) && value.length === definition.items.length
    case 'object':
    case 'record':
      return isPlainObject(value)
    case 'or':
      return definition.options.some(opt => matchesDefinition((opt as RuntimeSchema)[DEFINITION], value))
    case 'discriminatedUnion':
      return isPlainObject(value) && definition.map.has((value as Record<string, unknown>)[definition.discriminator])
    case 'intersection':
      return (
        matchesDefinition((definition.left as RuntimeSchema)[DEFINITION], value) &&
        matchesDefinition((definition.right as RuntimeSchema)[DEFINITION], value)
      )
  }
}

function resolveObjectShape(schema: RuntimeSchema, definition: ObjectDefinition): ObjectShape {
  const cached = definition.cache.get(schema)
  if (cached) {
    return cached
  }

  const shape = readObjectShape(definition.shape)

  for (const [key, value] of Object.entries(shape)) {
    assertSchema(value, `object field "${key}"`)
  }

  definition.cache.set(schema, shape)
  return shape
}

function readObjectShape(shape: ObjectShape): ObjectShape {
  const output: Record<string, unknown> = Object.create(null)
  const descriptors = Object.getOwnPropertyDescriptors(shape)

  for (const [key, descriptor] of Object.entries(descriptors)) {
    const value = typeof descriptor.get === 'function' ? descriptor.get.call(shape) : descriptor.value

    output[key] = value
  }

  return output as ObjectShape
}

function assertSchema(value: unknown, label: string): asserts value is SchemaLike<any, any, boolean> {
  if (!isSchema(value)) {
    throw new TypeError(`${label} must be a schema`)
  }
}

function issue(path: Path, code: SchemaIssue['code'], expected: string, received: unknown, message?: string): SchemaIssue {
  const candidate: SchemaIssue = {
    code,
    expected,
    message: message ?? `Expected ${expected} at ${formatPath(path)}, received ${describeValue(received)}`,
    path,
    received,
  }
  if (globalErrorMap) {
    const override = globalErrorMap(candidate)
    if (override) {
      candidate.message = override
    }
  }
  return candidate
}

function success<T>(value: T): ParseSuccess<T> {
  return {
    ok: true,
    value,
  }
}

function failure(...issues: SchemaIssue[]): ParseFailure {
  return {
    issues,
    ok: false,
  }
}

function expectedType(definition: SchemaDefinition): string {
  switch (definition.kind) {
    case 'any':
      return 'any'

    case 'array':
      return `array<${expectedType((definition.item as RuntimeSchema)[DEFINITION])}>`

    case 'arrayBuffer':
      return 'ArrayBuffer'

    case 'blob':
      return 'Blob'

    case 'bigint':
    case 'boolean':
    case 'date':
    case 'file':
    case 'null':
    case 'number':
    case 'string':
      return definition.expected

    case 'enum':
    case 'literal':
      return definition.expected

    case 'intersection':
      return `${expectedType((definition.left as RuntimeSchema)[DEFINITION])} & ${expectedType((definition.right as RuntimeSchema)[DEFINITION])}`


    case 'object':
      return 'object'

    case 'or':
      return definition.options.map(option => expectedType((option as RuntimeSchema)[DEFINITION])).join(' | ')

    case 'discriminatedUnion':
      return definition.expected

    case 'record':
      return `record<${expectedType((definition.value as RuntimeSchema)[DEFINITION])}>`

    case 'tuple':
      return 'tuple'

    case 'unknown':
      return 'unknown'
  }
}

function formatPath(path: Path): string {
  if (path.length === 0) {
    return '<root>'
  }

  return path
    .map(item => (typeof item === 'number' ? `[${item}]` : item))
    .join('.')
    .replace('.[', '[')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function cloneValue<T>(value: T): T {
  if (value === null || value === undefined) {
    return value
  }

  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }

  if (Array.isArray(value)) {
    return value.map(item => cloneValue(item)) as T
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T
  }

  if (value instanceof ArrayBuffer) {
    return value.slice(0) as T
  }

  if (isPlainObject(value)) {
    const output: Record<string, unknown> = Object.create(null)
    for (const [key, item] of Object.entries(value)) {
      output[key] = cloneValue(item)
    }
    return output as T
  }

  return value
}

function describeValue(value: unknown): string {
  if (value === null) {
    return 'null'
  }

  if (value === undefined) {
    return 'undefined'
  }

  if (typeof value === 'string') {
    return JSON.stringify(value)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (value instanceof File) {
    return `File(${value.name})`
  }

  if (value instanceof Blob) {
    return `Blob(${value.type || 'application/octet-stream'})`
  }

  if (value instanceof ArrayBuffer) {
    return `ArrayBuffer(${value.byteLength})`
  }

  if (Array.isArray(value)) {
    return 'array'
  }

  if (isPlainObject(value)) {
    return 'object'
  }

  return Object.prototype.toString.call(value)
}

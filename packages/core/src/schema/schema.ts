const DEFINITION = Symbol('schema.definition')
const TYPES = Symbol('schema.types')
const OMIT = Symbol('schema.omit')
type Path = Array<number | string>
type ParseMode = 'field' | 'value'
type RefineResult = boolean | Error | null | string | undefined | void
type RefineCheck<T> = (value: Readonly<T>) => RefineResult
type LiteralValue = boolean | null | number | string

interface SchemaTypes<Input = unknown, Output = unknown, OptionalOut extends boolean = false> {
  input: Input
  optionalOut: OptionalOut
  output: Output
}

export interface SchemaLike {
  readonly [TYPES]: SchemaTypes<any, any, boolean>
}

type IsOptionalOutput<T extends SchemaLike> = T extends OptionalOutputSchema ? true : false

export interface SchemaIssue {
  code: 'custom' | 'invalid_enum' | 'invalid_literal' | 'invalid_type' | 'invalid_union'
  expected: string
  message: string
  path: Path
  received: unknown
}

export class SchemaError extends Error {
  readonly issues: SchemaIssue[]

  constructor(issues: SchemaIssue[]) {
    super(issues[0]?.message ?? 'Schema parse failed')
    this.name = 'SchemaError'
    this.issues = issues
  }
}

interface SchemaMethods extends SchemaLike {
  alias(alias: string): this
  default(value: Exclude<TypeOf<this>, undefined>): Schema<
    InputOf<this> | undefined,
    Exclude<TypeOf<this>, undefined>,
    false
  >
  null(): Schema<InputOf<this> | null, TypeOf<this> | null, IsOptionalOutput<this>>
  nullish(): Schema<InputOf<this> | null | undefined, TypeOf<this> | null | undefined, true>
  optional(): Schema<InputOf<this> | undefined, TypeOf<this> | undefined, true>
  parse(value: unknown): TypeOf<this>
  refine(
    check: RefineCheck<TypeOf<this>>,
    message?: string,
  ): this
}

export type Schema<Input = unknown, Output = Input, OptionalOut extends boolean = false> = SchemaMethods & {
  readonly [TYPES]: SchemaTypes<Input, Output, OptionalOut>
}

export type AnySchema = Schema<any, any, boolean>
type OptionalOutputSchema = {
  readonly [TYPES]: SchemaTypes<any, any, true>
}

export type TypeOf<T> = T extends SchemaLike ? T[typeof TYPES]['output'] : never
export type InputOf<T> = T extends SchemaLike ? T[typeof TYPES]['input'] : never

export type FieldOutput<S> = S extends SchemaLike
  ? S extends OptionalOutputSchema
    ? Exclude<TypeOf<S>, undefined>
    : TypeOf<S>
  : never

export type ObjectShape = Readonly<Record<string, any>>

export type ObjectInput<T extends Record<string, any>> = Partial<{
  [K in keyof T]: InputOf<T[K]>
}>

export type ObjectOutput<T extends Record<string, any>> = {
  -readonly [K in keyof T as T[K] extends OptionalOutputSchema ? never : K]: FieldOutput<T[K]>
} & {
  -readonly [K in keyof T as T[K] extends OptionalOutputSchema ? K : never]?: FieldOutput<T[K]>
}

type TupleOutput<T extends readonly SchemaLike[]> = {
  -readonly [K in keyof T]: TypeOf<T[K]>
}

type UnionOutput<T extends readonly SchemaLike[]> = {
  [K in keyof T]: T[K] extends SchemaLike ? TypeOf<T[K]> : never
}[number]

export type ArraySchema<S extends SchemaLike> = Schema<Array<InputOf<S>>, Array<TypeOf<S>>>
export type ObjectSchema<T extends Record<string, any>> = Schema<ObjectInput<T>, ObjectOutput<T>>
export type RecordSchema<S extends SchemaLike> = Schema<Record<string, InputOf<S>>, Record<string, FieldOutput<S>>>
export type TupleSchema<T extends readonly SchemaLike[]> = Schema<TupleOutput<T>, TupleOutput<T>>
export type UnionSchema<T extends readonly SchemaLike[]> = Schema<unknown, UnionOutput<T>>

type SchemaFlags = {
  alias?: string
  defaultValue?: unknown
  hasDefault: boolean
  nullable: boolean
  optional: boolean
}

type Refinement<T> = {
  check: RefineCheck<T>
  message?: string
}

type BaseDefinition = {
  flags: SchemaFlags
  refinements: ReadonlyArray<Refinement<any>>
}

type PrimitiveKind = 'arrayBuffer' | 'blob' | 'boolean' | 'file' | 'null' | 'number' | 'string'

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
  item: SchemaLike
}

type ObjectDefinition = BaseDefinition & {
  cache: WeakMap<RuntimeSchema, ObjectShape>
  kind: 'object'
  shape: ObjectShape
}

type RecordDefinition = BaseDefinition & {
  kind: 'record'
  value: SchemaLike
}

type TupleDefinition = BaseDefinition & {
  kind: 'tuple'
  items: readonly [SchemaLike, ...SchemaLike[]]
}

type UnionDefinition = BaseDefinition & {
  kind: 'or'
  options: readonly [SchemaLike, ...SchemaLike[]]
}

type SchemaDefinition =
  | ArrayDefinition
  | AnyDefinition
  | EnumDefinition<any>
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

type RuntimeSchema = {
  readonly [DEFINITION]: SchemaDefinition
  readonly [TYPES]: SchemaTypes<unknown, unknown, boolean>
  alias(alias: string): RuntimeSchema
  default(value: unknown): RuntimeSchema
  null(): RuntimeSchema
  nullish(): RuntimeSchema
  optional(): RuntimeSchema
  parse(value: unknown): unknown
  refine(check: RefineCheck<unknown>, message?: string): RuntimeSchema
}

export function isSchema(value: unknown): value is AnySchema {
  return typeof value === 'object' && value !== null && DEFINITION in value
}

export function createStringSchema(): Schema<string | undefined, string> {
  return createPrimitiveSchema({
    expected: 'string',
    is: (value): value is string => typeof value === 'string',
    kind: 'string',
    zero: () => '',
  })
}

export function createNumberSchema(): Schema<number | undefined, number> {
  return createPrimitiveSchema({
    expected: 'number',
    is: (value): value is number => typeof value === 'number' && !Number.isNaN(value),
    kind: 'number',
    zero: () => 0,
  })
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
  }) as Schema<null, null>
}

export function createAnySchema(): Schema<unknown, any> {
  return makeSchema({
    flags: createFlags(),
    kind: 'any',
    refinements: [],
  }) as Schema<unknown, any>
}

export function createUnknownSchema(): Schema<unknown, unknown> {
  return makeSchema({
    flags: createFlags(),
    kind: 'unknown',
    refinements: [],
  }) as Schema<unknown, unknown>
}

export function createLiteralSchema<const T extends LiteralValue>(value: T): Schema<T | undefined, T> {
  return makeSchema({
    expected: describeValue(value),
    flags: createFlags(),
    kind: 'literal',
    refinements: [],
    value,
  }) as Schema<T | undefined, T>
}

export function createEnumSchema<const T extends readonly [string, ...string[]]>(
  values: T,
): Schema<T[number] | undefined, T[number]> {
  return makeSchema({
    expected: values.map(item => JSON.stringify(item)).join(' | '),
    flags: createFlags(),
    kind: 'enum',
    refinements: [],
    values,
  }) as Schema<T[number] | undefined, T[number]>
}

export function createObjectEnumSchema<const T extends Record<string, number | string>>(
  value: T,
): Schema<T[keyof T] | undefined, T[keyof T]> {
  const values = Object.values(value).filter(
    (item): item is T[keyof T] => typeof item === 'number' || typeof item === 'string',
  )

  if (values.length === 0) {
    throw new TypeError('enum schema requires at least one string or number value')
  }

  return makeSchema({
    expected: values.map(item => JSON.stringify(item)).join(' | '),
    flags: createFlags(),
    kind: 'enum',
    refinements: [],
    values: values as [T[keyof T], ...T[keyof T][]],
  }) as Schema<T[keyof T] | undefined, T[keyof T]>
}

export function createArraySchema<S extends SchemaLike>(
  item: S,
): ArraySchema<S> {
  assertSchema(item, 'array item')

  return makeSchema({
    flags: createFlags(),
    item,
    kind: 'array',
    refinements: [],
  }) as ArraySchema<S>
}

export function createObjectSchema<const T extends Record<string, any>>(
  shape: T,
): ObjectSchema<T> {
  if (!isPlainObject(shape)) {
    throw new TypeError('object schema requires a plain object')
  }

  return makeSchema({
    cache: new WeakMap(),
    flags: createFlags(),
    kind: 'object',
    refinements: [],
    shape,
  }) as ObjectSchema<T>
}

export function createRecordSchema<S extends SchemaLike>(
  value: S,
): RecordSchema<S> {
  assertSchema(value, 'record value')

  return makeSchema({
    flags: createFlags(),
    kind: 'record',
    refinements: [],
    value,
  }) as RecordSchema<S>
}

export function createTupleSchema<const T extends readonly [SchemaLike, ...SchemaLike[]]>(
  items: T,
): TupleSchema<T> {
  for (const item of items) {
    assertSchema(item, 'tuple item')
  }

  return makeSchema({
    flags: createFlags(),
    items,
    kind: 'tuple',
    refinements: [],
  }) as TupleSchema<T>
}

export function createUnionSchema<const T extends readonly [SchemaLike, ...SchemaLike[]]>(
  options: T,
): UnionSchema<T> {
  for (const option of options) {
    assertSchema(option, 'or option')
  }

  return makeSchema({
    flags: createFlags(),
    kind: 'or',
    options,
    refinements: [],
  }) as UnionSchema<T>
}

export function createBlobSchema(): Schema<Blob | undefined, Blob> {
  return createPrimitiveSchema({
    expected: 'Blob',
    is: (value): value is Blob => value instanceof Blob,
    kind: 'blob',
    zero: () => new Blob(),
  })
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
    flags: createFlags(),
    refinements: [],
  }) as Schema<T | undefined, T>
}

function createFlags(): SchemaFlags {
  return {
    hasDefault: false,
    nullable: false,
    optional: false,
  }
}

function makeSchema(definition: SchemaDefinition): RuntimeSchema {
  const schema: RuntimeSchema = {
    [DEFINITION]: definition,
    [TYPES]: undefined as never,
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
    parse(value: unknown) {
      const result = parseValue(schema, value, [], 'value')

      if (!result.ok) {
        throw new SchemaError(result.issues)
      }

      return result.value
    },
    refine(check: RefineCheck<unknown>, message?: string) {
      if (typeof check !== 'function') {
        throw new TypeError('refine() requires a validation function')
      }

      return makeSchema({
        ...definition,
        refinements: [...definition.refinements, { check, message }],
      })
    },
  }

  return schema
}

function parseValue(schema: RuntimeSchema, input: unknown, path: Path, mode: ParseMode): ParseResult<unknown> {
  const definition = schema[DEFINITION]

  if (input === undefined) {
    return parseMissingValue(schema, path, mode)
  }

  if (input === null) {
    if (definition.kind === 'null' || definition.flags.nullable) {
      return applyRefinements(schema, null, path)
    }

    return failure(issue(path, 'invalid_type', expectedType(definition), input))
  }

  switch (definition.kind) {
    case 'any':
    case 'unknown':
      return applyRefinements(schema, input, path)

    case 'array':
      return parseArrayValue(schema, definition, input, path)

    case 'arrayBuffer':
    case 'blob':
    case 'boolean':
    case 'file':
    case 'null':
    case 'number':
    case 'string':
      return parsePrimitiveValue(schema, definition, input, path)

    case 'enum':
      return parseEnumValue(schema, definition, input, path)

    case 'literal':
      return parseLiteralValue(schema, definition, input, path)

    case 'object':
      return parseObjectValue(schema, definition, input, path)

    case 'or':
      return parseUnionValue(schema, definition, input, path)

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

function parseEnumValue(
  schema: RuntimeSchema,
  definition: EnumDefinition<any>,
  input: unknown,
  path: Path,
): ParseResult<unknown> {
  if (!definition.values.includes(input)) {
    return failure(issue(path, 'invalid_enum', definition.expected, input))
  }

  return applyRefinements(schema, input, path)
}

function parseLiteralValue(
  schema: RuntimeSchema,
  definition: LiteralDefinition<any>,
  input: unknown,
  path: Path,
): ParseResult<unknown> {
  if (!Object.is(input, definition.value)) {
    return failure(issue(path, 'invalid_literal', definition.expected, input))
  }

  return applyRefinements(schema, input, path)
}

function parseArrayValue(
  schema: RuntimeSchema,
  definition: ArrayDefinition,
  input: unknown,
  path: Path,
): ParseResult<unknown[]> {
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
  const output: Record<string, unknown> = {}
  const issues: SchemaIssue[] = []

  for (const [key, itemSchema] of Object.entries(shape)) {
    const itemDefinition = (itemSchema as RuntimeSchema)[DEFINITION]
    const inputKey = itemDefinition.flags.alias ?? key
    const result = parseValue(itemSchema as RuntimeSchema, input[inputKey], [...path, key], 'field')

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

function parseRecordValue(
  schema: RuntimeSchema,
  definition: RecordDefinition,
  input: unknown,
  path: Path,
): ParseResult<Record<string, unknown>> {
  if (!isPlainObject(input)) {
    return failure(issue(path, 'invalid_type', 'object', input))
  }

  const output: Record<string, unknown> = {}
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

function parseTupleValue(
  schema: RuntimeSchema,
  definition: TupleDefinition,
  input: unknown,
  path: Path,
): ParseResult<unknown[]> {
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

function parseUnionValue(
  schema: RuntimeSchema,
  definition: UnionDefinition,
  input: unknown,
  path: Path,
): ParseResult<unknown> {
  for (const option of definition.options) {
    const result = parseValue(option as RuntimeSchema, input, path, 'value')
    if (result.ok) {
      return applyRefinements(schema, result.value, path)
    }
  }

  return failure(issue(path, 'invalid_union', expectedType(definition), input))
}

function applyRefinements(schema: RuntimeSchema, value: unknown, path: Path): ParseResult<unknown> {
  const issues: SchemaIssue[] = []
  const definition = schema[DEFINITION]

  for (const refinement of definition.refinements) {
      const result = refinement.check(value as never)

    if (result === false) {
      issues.push(issue(path, 'custom', expectedType(definition), value, refinement.message))
      continue
    }

    if (typeof result === 'string') {
      issues.push(issue(path, 'custom', expectedType(definition), value, result))
      continue
    }

    if (result instanceof Error) {
      issues.push(issue(path, 'custom', expectedType(definition), value, result.message))
    }
  }

  return issues.length > 0 ? failure(...issues) : success(value)
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
    case 'blob':
    case 'boolean':
    case 'file':
    case 'null':
    case 'number':
    case 'string':
      return definition.zero()

    case 'enum':
      return cloneValue(definition.values[0])

    case 'literal':
      return cloneValue(definition.value)

    case 'object': {
      const output: Record<string, unknown> = {}
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
  const output: Record<string, unknown> = {}
  const descriptors = Object.getOwnPropertyDescriptors(shape)

  for (const [key, descriptor] of Object.entries(descriptors)) {
    const value =
      typeof descriptor.get === 'function'
        ? descriptor.get.call(shape)
        : descriptor.value

    output[key] = value
  }

  return output as ObjectShape
}

function assertSchema(value: unknown, label: string): asserts value is SchemaLike {
  if (!isSchema(value)) {
    throw new TypeError(`${label} must be a schema`)
  }
}

function issue(
  path: Path,
  code: SchemaIssue['code'],
  expected: string,
  received: unknown,
  message?: string,
): SchemaIssue {
  return {
    code,
    expected,
    message: message ?? `Expected ${expected} at ${formatPath(path)}, received ${describeValue(received)}`,
    path,
    received,
  }
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
      return 'array'

    case 'arrayBuffer':
      return 'ArrayBuffer'

    case 'blob':
      return 'Blob'

    case 'boolean':
    case 'file':
    case 'null':
    case 'number':
    case 'string':
      return definition.expected

    case 'enum':
    case 'literal':
      return definition.expected

    case 'object':
      return 'object'

    case 'or':
      return definition.options.map(option => expectedType((option as RuntimeSchema)[DEFINITION])).join(' | ')

    case 'record':
      return 'object'

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

  if (value instanceof ArrayBuffer) {
    return value.slice(0) as T
  }

  if (isPlainObject(value)) {
    const output: Record<string, unknown> = {}
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

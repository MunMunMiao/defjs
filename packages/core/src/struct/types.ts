import type { ExcludeUnion } from '../internal/utility_types'
import type { StructError } from './errors'
import type { DEFINITION, TYPES } from './symbols'
import type { FieldTagOption } from './tag'

export type Path = Array<number | string>
export type ParseMode = 'field' | 'value'

export type ParseTuple<O> = [error: StructError | null, value: O]
export type LiteralValue = boolean | null | number | string

export interface SchemaTypes<Input = unknown, Output = unknown, OptionalOut extends boolean = false> {
  input: Input
  optionalOut: OptionalOut extends true ? true : undefined
  output: Output
}

export interface SchemaLike<I = unknown, O = unknown, OO extends boolean = boolean> {
  readonly [TYPES]: SchemaTypes<I, O, OO>
  readonly _struct: SchemaTypes<I, O, OO>
}

export type OptionalOutputSchema = {
  readonly _struct: {
    readonly optionalOut: true
  }
}

export interface SchemaIssue {
  code: 'custom' | 'invalid_enum' | 'invalid_literal' | 'invalid_type' | 'invalid_union' | 'missing_key'
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
  fieldErrors: { [key: string]: string[] }
}

export interface SchemaMethods<I, O, OO extends boolean> {
  null(): Schema<I | null, O | null, OO>
  nullish(): Schema<I | null | undefined, O | null | undefined, true>
  optional(): Schema<I | undefined, O | undefined, true>
  tag(...options: FieldTagOption[]): Schema<I, O, OO>
}

export type Schema<Input = unknown, Output = Input, OptionalOut extends boolean = false> = SchemaMethods<Input, Output, OptionalOut> &
  SchemaLike<Input, Output, OptionalOut>

// Type boundary: AnySchema represents the public type returned by struct.any(). The output is intentionally
// unconstrained because the schema makes no static guarantees about decoded values.
// oxlint-disable-next-line typescript/no-explicit-any
export type AnySchema = Schema<any, any, boolean>

type SchemaInput<T> = T extends { readonly _struct: { readonly input: unknown } } ? T['_struct']['input'] : never
type SchemaOutput<T> = T extends { readonly _struct: { readonly output: unknown } } ? T['_struct']['output'] : never

export type Infer<T> = SchemaOutput<T>

// Type boundary: FieldOutput inspects the generic schema surface; `unknown` lets the
// conditional type match any SchemaLike without over-constraining callers.
export type FieldOutput<S> =
  S extends SchemaLike<unknown, unknown, boolean>
    ? S extends OptionalOutputSchema
      ? ExcludeUnion<S['_struct']['output'], undefined>
      : S['_struct']['output']
    : never

export type Simplify<T> = { [K in keyof T]: T[K] } & {}

// Type boundary: ObjectShape accepts any field schema type; `any` is the only way to express "a record whose
// values are arbitrary schema instances" before the caller provides a concrete shape.
// oxlint-disable-next-line typescript/no-explicit-any
export type ObjectShape = { [key: string]: any }

export type ObjectInput<T extends ObjectShape> = Simplify<{
  -readonly [K in keyof T]?: T[K]['_struct']['input']
}>

export type ObjectOutput<T extends ObjectShape> = Simplify<
  {
    -readonly [K in keyof T as T[K] extends OptionalOutputSchema ? never : K]: T[K] extends OptionalOutputSchema
      ? ExcludeUnion<T[K]['_struct']['output'], undefined>
      : T[K]['_struct']['output']
  } & {
    -readonly [K in keyof T as T[K] extends OptionalOutputSchema ? K : never]?: T[K] extends OptionalOutputSchema
      ? ExcludeUnion<T[K]['_struct']['output'], undefined>
      : T[K]['_struct']['output']
  }
>

export type TupleOutput<T extends readonly SchemaLike<unknown, unknown, boolean>[]> = {
  -readonly [K in keyof T]: SchemaOutput<T[K]>
}

// Type boundary: UnionOutput ranges over arbitrary schema elements; `unknown` matches any SchemaLike.
export type UnionOutput<T extends readonly SchemaLike<unknown, unknown, boolean>[]> = {
  // Type boundary: per-element schema output extraction; `unknown` preserves distributivity over all schemas.
  [K in keyof T]: T[K] extends SchemaLike<unknown, unknown, boolean> ? SchemaOutput<T[K]> : never
}[number]

export type StringSchema = Schema<string | undefined, string>

export type NumberSchema = Schema<number | undefined, number>

// Type boundary: ArrayInput/Output work with any element schema; `unknown` is the generic placeholder.
export type ArrayInput<S extends SchemaLike<unknown, unknown, boolean>> = SchemaInput<S>[]
export type ArrayOutput<S extends SchemaLike<unknown, unknown, boolean>> = SchemaOutput<S>[]

// Type boundary: ArraySchemaTypes generalises over any element schema.
export interface ArraySchemaTypes<S extends SchemaLike<unknown, unknown, boolean>> extends SchemaTypes<
  ArrayInput<S>,
  ArrayOutput<S>,
  false
> {
  input: ArrayInput<S>
  optionalOut: undefined
  output: ArrayOutput<S>
}

// Type boundary: ArraySchema generalises over any element schema.
export interface ArraySchema<S extends SchemaLike<unknown, unknown, boolean>>
  extends SchemaMethods<ArrayInput<S>, ArrayOutput<S>, false>, SchemaLike<ArrayInput<S>, ArrayOutput<S>, false> {
  readonly [TYPES]: ArraySchemaTypes<S>
  readonly _struct: ArraySchemaTypes<S>
}

export interface ObjectSchemaTypes<T extends ObjectShape> extends SchemaTypes<ObjectInput<T>, ObjectOutput<T>, false> {
  input: ObjectInput<T>
  optionalOut: undefined
  output: ObjectOutput<T>
}

export interface ObjectSchema<T extends ObjectShape>
  extends SchemaMethods<ObjectInput<T>, ObjectOutput<T>, false>, SchemaLike<ObjectInput<T>, ObjectOutput<T>, false> {
  readonly [TYPES]: ObjectSchemaTypes<T>
  readonly _struct: ObjectSchemaTypes<T>
}

export type RequestBodyCodec = 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text' | 'urlencoded'

export interface RequestBodySchemaTypes<C extends RequestBodyCodec, S extends SchemaLike<unknown, unknown, boolean>> extends SchemaTypes<
  SchemaInput<S>,
  SchemaOutput<S>,
  false
> {
  codec: C
  input: SchemaInput<S>
  optionalOut: undefined
  output: SchemaOutput<S>
}

export interface RequestBodySchema<C extends RequestBodyCodec, S extends SchemaLike<unknown, unknown, boolean>>
  extends SchemaMethods<SchemaInput<S>, SchemaOutput<S>, false>, SchemaLike<SchemaInput<S>, SchemaOutput<S>, false> {
  readonly [TYPES]: RequestBodySchemaTypes<C, S>
  readonly _struct: RequestBodySchemaTypes<C, S>
}

export type RequestBinaryBodySchema = Schema<ArrayBuffer | undefined, ArrayBuffer> | Schema<Blob | undefined, Blob>
export type RequestBodyShapeSchema = RequestBinaryBodySchema | RequestBodySchema<RequestBodyCodec, SchemaLike<unknown, unknown, boolean>>

export type RequestShape = {
  body?: RequestBodyShapeSchema
  headers?: ObjectSchema<ObjectShape>
  path?: ObjectSchema<ObjectShape>
  query?: ObjectSchema<ObjectShape>
}

export type RequestInput<T extends RequestShape> = Simplify<
  (T['path'] extends ObjectSchema<ObjectShape> ? { path?: SchemaInput<T['path']> } : {}) &
    (T['query'] extends ObjectSchema<ObjectShape> ? { query?: SchemaInput<T['query']> } : {}) &
    (T['headers'] extends ObjectSchema<ObjectShape> ? { headers?: SchemaInput<T['headers']> } : {}) &
    (T['body'] extends SchemaLike<unknown, unknown, boolean> ? { body?: SchemaInput<T['body']> } : {})
>

export type RequestOutput<T extends RequestShape> = Simplify<
  (T['path'] extends ObjectSchema<ObjectShape> ? { path: SchemaOutput<T['path']> } : {}) &
    (T['query'] extends ObjectSchema<ObjectShape> ? { query: SchemaOutput<T['query']> } : {}) &
    (T['headers'] extends ObjectSchema<ObjectShape> ? { headers: SchemaOutput<T['headers']> } : {}) &
    (T['body'] extends SchemaLike<unknown, unknown, boolean> ? { body: SchemaOutput<T['body']> } : {})
>

export interface RequestSchemaTypes<T extends RequestShape> extends SchemaTypes<RequestInput<T>, RequestOutput<T>, false> {
  input: RequestInput<T>
  optionalOut: undefined
  output: RequestOutput<T>
}

export interface RequestSchema<T extends RequestShape>
  extends SchemaMethods<RequestInput<T>, RequestOutput<T>, false>, SchemaLike<RequestInput<T>, RequestOutput<T>, false> {
  readonly [TYPES]: RequestSchemaTypes<T>
  readonly _struct: RequestSchemaTypes<T>
}

export type RecordSchema<S extends SchemaLike<unknown, unknown, boolean>> = Schema<
  { [key: string]: SchemaInput<S> },
  { [key: string]: FieldOutput<S> }
>
export type TupleSchema<T extends readonly SchemaLike<unknown, unknown, boolean>[]> = Schema<TupleOutput<T>, TupleOutput<T>>
export type UnionSchema<T extends readonly SchemaLike<unknown, unknown, boolean>[]> = Schema<unknown, UnionOutput<T>>
export type DiscriminatedUnionSchema<TOptions extends readonly ObjectSchema<ObjectShape>[]> = Schema<
  unknown,
  SchemaOutput<TOptions[number]>
>

export type SchemaFlags = {
  nullable: boolean
  optional: boolean
}

export type BaseDefinition = {
  flags: SchemaFlags
  tagOptions?: readonly FieldTagOption[]
}

export type PrimitiveKind = 'arrayBuffer' | 'bigint' | 'blob' | 'boolean' | 'date' | 'file' | 'null' | 'number' | 'string'

export type PrimitiveDefinition<K extends PrimitiveKind, TInput, TOutput = TInput> = BaseDefinition & {
  decode?: (value: TInput, path: Path) => ParseResult<TOutput>
  encode?: (value: TOutput) => unknown
  expected: string
  is: (value: unknown) => value is TInput
  kind: K
  zero: () => TOutput
}

export type AnyDefinition = BaseDefinition & {
  kind: 'any'
}

export type UnknownDefinition = BaseDefinition & {
  kind: 'unknown'
}

export type LiteralDefinition<T extends LiteralValue> = BaseDefinition & {
  expected: string
  kind: 'literal'
  value: T
}

export type EnumDefinition<T extends number | string> = BaseDefinition & {
  expected: string
  kind: 'enum'
  values: readonly [T, ...T[]]
}

export type ArrayDefinition = BaseDefinition & {
  kind: 'array'
  item: SchemaLike<unknown, unknown, boolean>
}

export type ObjectDefinition = BaseDefinition & {
  cache: WeakMap<RuntimeSchema, ObjectShape>
  kind: 'object'
  shape: ObjectShape
}

export type RequestBodyDefinition = BaseDefinition & {
  codec: RequestBodyCodec
  kind: 'requestBody'
  schema: SchemaLike<unknown, unknown, boolean>
}

export type RequestDefinition = BaseDefinition & {
  body?: SchemaLike<unknown, unknown, boolean>
  headers?: ObjectSchema<ObjectShape>
  kind: 'request'
  path?: ObjectSchema<ObjectShape>
  query?: ObjectSchema<ObjectShape>
}

export type RecordDefinition = BaseDefinition & {
  kind: 'record'
  value: SchemaLike<unknown, unknown, boolean>
}

export type TupleDefinition = BaseDefinition & {
  kind: 'tuple'
  items: readonly [SchemaLike<unknown, unknown, boolean>, ...SchemaLike<unknown, unknown, boolean>[]]
}

export type UnionDefinition = BaseDefinition & {
  kind: 'or'
  options: readonly [SchemaLike<unknown, unknown, boolean>, ...SchemaLike<unknown, unknown, boolean>[]]
}

export type DiscriminatedUnionDefinition = BaseDefinition & {
  kind: 'discriminatedUnion'
  discriminator: string
  expected: string
  map: Map<unknown, SchemaLike<unknown, unknown, boolean>>
  options: readonly [SchemaLike<unknown, unknown, boolean>, ...SchemaLike<unknown, unknown, boolean>[]]
}

export type IntersectionDefinition = BaseDefinition & {
  kind: 'intersection'
  left: SchemaLike<unknown, unknown, boolean>
  right: SchemaLike<unknown, unknown, boolean>
}

export type SchemaDefinition =
  | ArrayDefinition
  | AnyDefinition
  | DiscriminatedUnionDefinition
  | EnumDefinition<string | number>
  | IntersectionDefinition
  | LiteralDefinition<LiteralValue>
  | ObjectDefinition
  | PrimitiveDefinition<PrimitiveKind, unknown, unknown>
  | RecordDefinition
  | RequestBodyDefinition
  | RequestDefinition
  | TupleDefinition
  | UnknownDefinition
  | UnionDefinition

export type ParseFailure = {
  issues: SchemaIssue[]
  ok: false
}

export type ParseSuccess<T> = {
  ok: true
  value: T
}

export type ParseResult<T> = ParseFailure | ParseSuccess<T>

export type RuntimeSchema = {
  readonly [DEFINITION]: SchemaDefinition
  readonly [TYPES]: SchemaTypes<unknown, unknown, boolean>
  readonly _struct: SchemaTypes<unknown, unknown, boolean>
  null(): RuntimeSchema
  nullish(): RuntimeSchema
  optional(): RuntimeSchema
  tag(...options: FieldTagOption[]): RuntimeSchema
}

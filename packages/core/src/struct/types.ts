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
  fieldErrors: Record<string, string[]>
}

export interface SchemaMethods<I, O, OO extends boolean> {
  null(): Schema<I | null, O | null, OO>
  nullish(): Schema<I | null | undefined, O | null | undefined, true>
  optional(): Schema<I | undefined, O | undefined, true>
  tag(...options: FieldTagOption[]): Schema<I, O, OO>
}

export type Schema<Input = unknown, Output = Input, OptionalOut extends boolean = false> = SchemaMethods<Input, Output, OptionalOut> &
  SchemaLike<Input, Output, OptionalOut>

export type AnySchema = Schema<any, any, boolean>

type SchemaInput<T> = T extends { readonly _struct: { readonly input: unknown } } ? T['_struct']['input'] : never
type SchemaOutput<T> = T extends { readonly _struct: { readonly output: unknown } } ? T['_struct']['output'] : never

export type Infer<T> = SchemaOutput<T>

export type FieldOutput<S> =
  S extends SchemaLike<any, any, boolean>
    ? S extends OptionalOutputSchema
      ? Exclude<S['_struct']['output'], undefined>
      : S['_struct']['output']
    : never

export type Simplify<T> = { [K in keyof T]: T[K] } & {}

export type ObjectShape = Record<string, any>

export type ObjectInput<T extends ObjectShape> = Simplify<{
  -readonly [K in keyof T]?: T[K]['_struct']['input']
}>

export type ObjectOutput<T extends ObjectShape> = Simplify<
  {
    -readonly [K in keyof T as T[K] extends OptionalOutputSchema ? never : K]: T[K] extends OptionalOutputSchema
      ? Exclude<T[K]['_struct']['output'], undefined>
      : T[K]['_struct']['output']
  } & {
    -readonly [K in keyof T as T[K] extends OptionalOutputSchema ? K : never]?: T[K] extends OptionalOutputSchema
      ? Exclude<T[K]['_struct']['output'], undefined>
      : T[K]['_struct']['output']
  }
>

export type TupleOutput<T extends readonly SchemaLike<any, any, boolean>[]> = {
  -readonly [K in keyof T]: SchemaOutput<T[K]>
}

export type UnionOutput<T extends readonly SchemaLike<any, any, boolean>[]> = {
  [K in keyof T]: T[K] extends SchemaLike<any, any, boolean> ? SchemaOutput<T[K]> : never
}[number]

export type StringSchema = Schema<string | undefined, string>

export type NumberSchema = Schema<number | undefined, number>

export type ArrayInput<S extends SchemaLike<any, any, boolean>> = SchemaInput<S>[]
export type ArrayOutput<S extends SchemaLike<any, any, boolean>> = SchemaOutput<S>[]

export interface ArraySchemaTypes<S extends SchemaLike<any, any, boolean>> extends SchemaTypes<ArrayInput<S>, ArrayOutput<S>, false> {
  input: ArrayInput<S>
  optionalOut: undefined
  output: ArrayOutput<S>
}

export interface ArraySchema<S extends SchemaLike<any, any, boolean>>
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

export interface RequestBodySchemaTypes<C extends RequestBodyCodec, S extends SchemaLike<any, any, boolean>> extends SchemaTypes<
  SchemaInput<S>,
  SchemaOutput<S>,
  false
> {
  codec: C
  input: SchemaInput<S>
  optionalOut: undefined
  output: SchemaOutput<S>
}

export interface RequestBodySchema<C extends RequestBodyCodec, S extends SchemaLike<any, any, boolean>>
  extends SchemaMethods<SchemaInput<S>, SchemaOutput<S>, false>, SchemaLike<SchemaInput<S>, SchemaOutput<S>, false> {
  readonly [TYPES]: RequestBodySchemaTypes<C, S>
  readonly _struct: RequestBodySchemaTypes<C, S>
}

export type RequestBinaryBodySchema = Schema<ArrayBuffer | undefined, ArrayBuffer> | Schema<Blob | undefined, Blob>
export type RequestBodyShapeSchema = RequestBinaryBodySchema | RequestBodySchema<RequestBodyCodec, SchemaLike<any, any, boolean>>

export type RequestShape = {
  body?: RequestBodyShapeSchema
  headers?: ObjectSchema<any>
  path?: ObjectSchema<any>
  query?: ObjectSchema<any>
}

export type RequestInput<T extends RequestShape> = Simplify<
  (T['path'] extends ObjectSchema<any> ? { path?: SchemaInput<T['path']> } : {}) &
    (T['query'] extends ObjectSchema<any> ? { query?: SchemaInput<T['query']> } : {}) &
    (T['headers'] extends ObjectSchema<any> ? { headers?: SchemaInput<T['headers']> } : {}) &
    (T['body'] extends SchemaLike<any, any, boolean> ? { body?: SchemaInput<T['body']> } : {})
>

export type RequestOutput<T extends RequestShape> = Simplify<
  (T['path'] extends ObjectSchema<any> ? { path: SchemaOutput<T['path']> } : {}) &
    (T['query'] extends ObjectSchema<any> ? { query: SchemaOutput<T['query']> } : {}) &
    (T['headers'] extends ObjectSchema<any> ? { headers: SchemaOutput<T['headers']> } : {}) &
    (T['body'] extends SchemaLike<any, any, boolean> ? { body: SchemaOutput<T['body']> } : {})
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

export type RecordSchema<S extends SchemaLike<any, any, boolean>> = Schema<Record<string, SchemaInput<S>>, Record<string, FieldOutput<S>>>
export type TupleSchema<T extends readonly SchemaLike<any, any, boolean>[]> = Schema<TupleOutput<T>, TupleOutput<T>>
export type UnionSchema<T extends readonly SchemaLike<any, any, boolean>[]> = Schema<unknown, UnionOutput<T>>
export type DiscriminatedUnionSchema<TOptions extends readonly ObjectSchema<any>[]> = Schema<unknown, SchemaOutput<TOptions[number]>>

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
  item: SchemaLike<any, any, boolean>
}

export type ObjectDefinition = BaseDefinition & {
  cache: WeakMap<RuntimeSchema, ObjectShape>
  kind: 'object'
  shape: ObjectShape
}

export type RequestBodyDefinition = BaseDefinition & {
  codec: RequestBodyCodec
  kind: 'requestBody'
  schema: SchemaLike<any, any, boolean>
}

export type RequestDefinition = BaseDefinition & {
  body?: SchemaLike<any, any, boolean>
  headers?: ObjectSchema<any>
  kind: 'request'
  path?: ObjectSchema<any>
  query?: ObjectSchema<any>
}

export type RecordDefinition = BaseDefinition & {
  kind: 'record'
  value: SchemaLike<any, any, boolean>
}

export type TupleDefinition = BaseDefinition & {
  kind: 'tuple'
  items: readonly [SchemaLike<any, any, boolean>, ...SchemaLike<any, any, boolean>[]]
}

export type UnionDefinition = BaseDefinition & {
  kind: 'or'
  options: readonly [SchemaLike<any, any, boolean>, ...SchemaLike<any, any, boolean>[]]
}

export type DiscriminatedUnionDefinition = BaseDefinition & {
  kind: 'discriminatedUnion'
  discriminator: string
  expected: string
  map: Map<unknown, SchemaLike<any, any, boolean>>
  options: readonly [SchemaLike<any, any, boolean>, ...SchemaLike<any, any, boolean>[]]
}

export type IntersectionDefinition = BaseDefinition & {
  kind: 'intersection'
  left: SchemaLike<any, any, boolean>
  right: SchemaLike<any, any, boolean>
}

export type SchemaDefinition =
  | ArrayDefinition
  | AnyDefinition
  | DiscriminatedUnionDefinition
  | EnumDefinition<any>
  | IntersectionDefinition
  | LiteralDefinition<any>
  | ObjectDefinition
  | PrimitiveDefinition<PrimitiveKind, any, any>
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

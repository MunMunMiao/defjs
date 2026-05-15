import type { StructError } from './errors'
import { DEFINITION, TYPES } from './symbols'
import type { FieldTagOption } from './tag'

export type Path = Array<number | string>
export type ParseMode = 'field' | 'value'

export type ParseTuple<O> = [error: StructError | null, value: O]
export type LiteralValue = boolean | null | number | string
export type UnknownFieldsPolicy = 'error' | 'strip'

export interface ParseOptions {
  unknownFields?: UnknownFieldsPolicy
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

export interface SchemaMethods<I, O, OO extends boolean> {
  null(): Schema<I | null, O | null, OO>
  nullish(): Schema<I | null | undefined, O | null | undefined, true>
  optional(): Schema<I | undefined, O | undefined, true>
  parse(value: unknown, options?: ParseOptions): ParseTuple<O>
  parseAsync(value: unknown, options?: ParseOptions): Promise<ParseTuple<O>>
  brand<B extends string | symbol>(): Schema<I, O & { readonly __brand: B }, OO>
  encode(value: O): I
  tag(...options: FieldTagOption[]): Schema<I, O, OO>
  readonly '~standard': StandardSchemaProps<I, O>
}

export type Schema<Input = unknown, Output = Input, OptionalOut extends boolean = false> = SchemaMethods<Input, Output, OptionalOut> &
  SchemaLike<Input, Output, OptionalOut>

export type AnySchema = Schema<any, any, boolean>

type SchemaInput<T> = T extends { readonly _struct: { readonly input: any } } ? T['_struct']['input'] : never
type SchemaOutput<T> = T extends { readonly _struct: { readonly output: any } } ? T['_struct']['output'] : never

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
  extends SchemaMethods<ArrayInput<S>, ArrayOutput<S>, false>,
    SchemaLike<ArrayInput<S>, ArrayOutput<S>, false> {
  readonly [TYPES]: ArraySchemaTypes<S>
  readonly _struct: ArraySchemaTypes<S>
}

export interface ObjectSchemaTypes<T extends ObjectShape> extends SchemaTypes<ObjectInput<T>, ObjectOutput<T>, false> {
  input: ObjectInput<T>
  optionalOut: undefined
  output: ObjectOutput<T>
}

export interface ObjectSchema<T extends ObjectShape>
  extends SchemaMethods<ObjectInput<T>, ObjectOutput<T>, false>,
    SchemaLike<ObjectInput<T>, ObjectOutput<T>, false> {
  readonly [TYPES]: ObjectSchemaTypes<T>
  readonly _struct: ObjectSchemaTypes<T>
}

export type RecordSchema<S extends SchemaLike<any, any, boolean>> = Schema<Record<string, SchemaInput<S>>, Record<string, FieldOutput<S>>>
export type TupleSchema<T extends readonly SchemaLike<any, any, boolean>[]> = Schema<TupleOutput<T>, TupleOutput<T>>
export type UnionSchema<T extends readonly SchemaLike<any, any, boolean>[]> = Schema<unknown, UnionOutput<T>>
export type DiscriminatedUnionSchema<TOptions extends readonly ObjectSchema<any>[]> = Schema<unknown, SchemaOutput<TOptions[number]>>

export type SchemaFlags = {
  branded?: boolean
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

export type RuntimeParseTuple = [error: StructError | null, value: unknown]

export type RuntimeSchema = {
  readonly [DEFINITION]: SchemaDefinition
  readonly [TYPES]: SchemaTypes<unknown, unknown, boolean>
  readonly _struct: SchemaTypes<unknown, unknown, boolean>
  readonly '~standard': StandardSchemaProps<unknown, unknown>
  null(): RuntimeSchema
  nullish(): RuntimeSchema
  optional(): RuntimeSchema
  parse(value: unknown, options?: ParseOptions): RuntimeParseTuple
  parseAsync(value: unknown, options?: ParseOptions): Promise<RuntimeParseTuple>
  brand(): RuntimeSchema
  encode(value: unknown): unknown
  tag(...options: FieldTagOption[]): RuntimeSchema
}

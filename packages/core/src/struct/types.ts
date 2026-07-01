import type { ExcludeUnion } from '../internal/utility_types'
import type { StructError } from './errors'
import type { ResolvedStructField } from './fields'
import type { DEFINITION } from './symbols'

export type Path = Array<number | string>
export type ParseMode = 'field' | 'value'

export type ParseTuple<O> = [error: StructError | null, value: O]
export type LiteralValue = boolean | null | number | string

export interface StructTypes<Input = unknown, Output = unknown, OptionalOut extends boolean = false> {
  input: Input
  optionalOut: OptionalOut extends true ? true : undefined
  output: Output
}

export interface StructLike<I = unknown, O = unknown, OO extends boolean = boolean> {
  readonly _struct: StructTypes<I, O, OO>
}

export type AnyStructLike = StructLike<unknown, unknown, boolean>

export type OptionalOutputStruct = {
  readonly _struct: {
    readonly optionalOut: true
  }
}

export interface StructIssue {
  code: 'custom' | 'invalid_enum' | 'invalid_literal' | 'invalid_type' | 'invalid_union' | 'missing_key'
  expected: string
  message: string
  path: Path
  received: unknown
}

export interface FormattedStructError {
  _errors: string[]
  [key: string]: FormattedStructError | string[]
}

export interface FlattenedStructError {
  formErrors: string[]
  fieldErrors: { [key: string]: string[] }
}

export interface StructMethods<I, O, OO extends boolean> {
  alias(name: string): Struct<I, O, OO>
  null(): Struct<I | null, O | null, OO>
  nullish(): Struct<I | null | undefined, O | null | undefined, true>
  optional(): Struct<I | undefined, O | undefined, true>
}

export type Struct<Input = unknown, Output = Input, OptionalOut extends boolean = false> = StructMethods<Input, Output, OptionalOut> &
  StructLike<Input, Output, OptionalOut>

// Type boundary: AnyStruct represents the public type returned by struct.any(). The output is intentionally
// unconstrained because the struct makes no static guarantees about decoded values.
// oxlint-disable-next-line typescript/no-explicit-any
export type AnyStruct = Struct<any, any, boolean>

type StructInput<T> = T extends { readonly _struct: { readonly input: unknown } } ? T['_struct']['input'] : never
type StructOutput<T> = T extends { readonly _struct: { readonly output: unknown } } ? T['_struct']['output'] : never

export type Infer<T> = StructOutput<T>

// Type boundary: FieldOutput inspects the generic struct surface; `unknown` lets the
// conditional type match any StructLike without over-constraining callers.
export type FieldOutput<S> =
  S extends StructLike<unknown, unknown, boolean>
    ? S extends OptionalOutputStruct
      ? ExcludeUnion<S['_struct']['output'], undefined>
      : S['_struct']['output']
    : never

export type Simplify<T> = { [K in keyof T]: T[K] } & {}

// Type boundary: ObjectShape accepts any field struct type; `any` is the only way to express "a record whose
// values are arbitrary struct instances" before the caller provides a concrete shape.
// oxlint-disable-next-line typescript/no-explicit-any
export type ObjectShape = { [key: string]: any }

export type ObjectInput<T extends ObjectShape> = Simplify<{
  -readonly [K in keyof T]?: T[K]['_struct']['input']
}>

export type ObjectOutput<T extends ObjectShape> = Simplify<
  {
    -readonly [K in keyof T as T[K] extends OptionalOutputStruct ? never : K]: FieldOutput<T[K]>
  } & {
    -readonly [K in keyof T as T[K] extends OptionalOutputStruct ? K : never]?: FieldOutput<T[K]>
  }
>

export type TupleOutput<T extends readonly StructLike<unknown, unknown, boolean>[]> = {
  -readonly [K in keyof T]: StructOutput<T[K]>
}

export type UnionOutput<T extends readonly StructLike<unknown, unknown, boolean>[]> = StructOutput<T[number]>

export type IntersectionOutput<T extends readonly StructLike<unknown, unknown, boolean>[]> = T extends readonly [
  infer Head extends StructLike<unknown, unknown, boolean>,
  ...infer Tail extends StructLike<unknown, unknown, boolean>[],
]
  ? StructOutput<Head> & IntersectionOutput<Tail>
  : unknown

export type StringStruct = Struct<string | undefined, string>

export type NumberStruct = Struct<number | undefined, number>

// Type boundary: ArrayInput/Output work with any element struct; `unknown` is the generic placeholder.
export type ArrayInput<S extends StructLike<unknown, unknown, boolean>> = StructInput<S>[]
export type ArrayOutput<S extends StructLike<unknown, unknown, boolean>> = StructOutput<S>[]

// Type boundary: ArrayStructTypes generalises over any element struct.
export interface ArrayStructTypes<S extends StructLike<unknown, unknown, boolean>> extends StructTypes<
  ArrayInput<S>,
  ArrayOutput<S>,
  false
> {
  input: ArrayInput<S>
  optionalOut: undefined
  output: ArrayOutput<S>
}

// Type boundary: ArrayStruct generalises over any element struct.
export interface ArrayStruct<S extends StructLike<unknown, unknown, boolean>>
  extends StructMethods<ArrayInput<S>, ArrayOutput<S>, false>, StructLike<ArrayInput<S>, ArrayOutput<S>, false> {
  readonly _struct: ArrayStructTypes<S>
}

export interface ObjectStructTypes<T extends ObjectShape> extends StructTypes<ObjectInput<T>, ObjectOutput<T>, false> {
  input: ObjectInput<T>
  optionalOut: undefined
  output: ObjectOutput<T>
}

export interface ObjectStruct<T extends ObjectShape>
  extends StructMethods<ObjectInput<T>, ObjectOutput<T>, false>, StructLike<ObjectInput<T>, ObjectOutput<T>, false> {
  readonly _struct: ObjectStructTypes<T>
}

export type RequestBodyCodec = 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text' | 'urlencoded'
export type ContentCodecKind = RequestBodyCodec
export const REQUEST_SECTION_KEYS = ['path', 'query', 'headers', 'body'] as const
export type RequestSectionKey = (typeof REQUEST_SECTION_KEYS)[number]

export type RequestBodyDescriptor = {
  codec: RequestBodyCodec
  struct: RuntimeStruct
}
export type ContentBoundaryDescriptor = RequestBodyDescriptor

export interface RequestBodyStructTypes<C extends RequestBodyCodec, S extends StructLike<unknown, unknown, boolean>> extends StructTypes<
  StructInput<S>,
  StructOutput<S>,
  false
> {
  codec: C
  input: StructInput<S>
  optionalOut: undefined
  output: StructOutput<S>
}

export interface RequestBodyStruct<C extends RequestBodyCodec, S extends StructLike<unknown, unknown, boolean>>
  extends StructMethods<StructInput<S>, StructOutput<S>, false>, StructLike<StructInput<S>, StructOutput<S>, false> {
  readonly _struct: RequestBodyStructTypes<C, S>
}

export type RequestBinaryBodyStruct = Struct<ArrayBuffer | undefined, ArrayBuffer> | Struct<Blob | undefined, Blob>
export type RequestBodyShapeStruct = RequestBinaryBodyStruct | RequestBodyStruct<RequestBodyCodec, StructLike<unknown, unknown, boolean>>

export type RequestShape = {
  body?: RequestBodyShapeStruct
  headers?: ObjectStruct<ObjectShape>
  path?: ObjectStruct<ObjectShape>
  query?: ObjectStruct<ObjectShape>
}

export type RequestInput<T extends RequestShape> = Simplify<
  (T['path'] extends ObjectStruct<ObjectShape> ? { path?: StructInput<T['path']> } : {}) &
    (T['query'] extends ObjectStruct<ObjectShape> ? { query?: StructInput<T['query']> } : {}) &
    (T['headers'] extends ObjectStruct<ObjectShape> ? { headers?: StructInput<T['headers']> } : {}) &
    (T['body'] extends StructLike<unknown, unknown, boolean> ? { body?: StructInput<T['body']> } : {})
>

export type RequestOutput<T extends RequestShape> = Simplify<
  (T['path'] extends ObjectStruct<ObjectShape> ? { path: StructOutput<T['path']> } : {}) &
    (T['query'] extends ObjectStruct<ObjectShape> ? { query: StructOutput<T['query']> } : {}) &
    (T['headers'] extends ObjectStruct<ObjectShape> ? { headers: StructOutput<T['headers']> } : {}) &
    (T['body'] extends StructLike<unknown, unknown, boolean> ? { body: StructOutput<T['body']> } : {})
>

export interface RequestStructTypes<T extends RequestShape> extends StructTypes<RequestInput<T>, RequestOutput<T>, false> {
  input: RequestInput<T>
  optionalOut: undefined
  output: RequestOutput<T>
}

export interface RequestStruct<T extends RequestShape>
  extends StructMethods<RequestInput<T>, RequestOutput<T>, false>, StructLike<RequestInput<T>, RequestOutput<T>, false> {
  readonly _struct: RequestStructTypes<T>
}

export type RecordStruct<S extends StructLike<unknown, unknown, boolean>> = Struct<
  { [key: string]: StructInput<S> },
  { [key: string]: FieldOutput<S> }
>
export type TupleStruct<T extends readonly StructLike<unknown, unknown, boolean>[]> = Struct<TupleOutput<T>, TupleOutput<T>>
export type UnionStruct<T extends readonly StructLike<unknown, unknown, boolean>[]> = Struct<unknown, UnionOutput<T>>
export type DiscriminatedUnionStruct<TOptions extends readonly ObjectStruct<ObjectShape>[]> = Struct<
  unknown,
  StructOutput<TOptions[number]>
>

export type StructFlags = {
  nullable: boolean
  optional: boolean
}

export type BaseDefinition = {
  alias?: string
  flags: StructFlags
}

export type PrimitiveKind = 'arrayBuffer' | 'bigint' | 'blob' | 'boolean' | 'date' | 'file' | 'null' | 'number' | 'string'

export type PrimitiveDefinition<K extends PrimitiveKind, TInput, TOutput = TInput> = BaseDefinition & {
  decode?: (value: TInput, path: Path) => ParseResult<TOutput>
  encode?: (value: TOutput) => unknown
  expected: string
  is: (value: unknown) => value is TInput
  kind: K
  runtimeIs?: (value: unknown) => boolean
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
  item: StructLike<unknown, unknown, boolean>
}

export type ObjectDefinitionCache = {
  fields?: readonly ResolvedStructField[]
  resolvedShape?: ObjectShape
}

export type ObjectDefinition = BaseDefinition & {
  readonly cache: ObjectDefinitionCache
  kind: 'object'
  shape: ObjectShape
}

export type RequestBodyDefinition = BaseDefinition & {
  codec: RequestBodyCodec
  kind: 'requestBody'
  struct: StructLike<unknown, unknown, boolean>
}

export type RequestDefinition = BaseDefinition & {
  body?: StructLike<unknown, unknown, boolean>
  bodyDescriptor?: RequestBodyDescriptor
  headers?: ObjectStruct<ObjectShape>
  kind: 'request'
  path?: ObjectStruct<ObjectShape>
  query?: ObjectStruct<ObjectShape>
}

export type RecordDefinition = BaseDefinition & {
  kind: 'record'
  value: StructLike<unknown, unknown, boolean>
}

export type TupleDefinition = BaseDefinition & {
  kind: 'tuple'
  items: readonly [StructLike<unknown, unknown, boolean>, ...StructLike<unknown, unknown, boolean>[]]
}

export type UnionDefinition = BaseDefinition & {
  kind: 'or'
  options: readonly [StructLike<unknown, unknown, boolean>, ...StructLike<unknown, unknown, boolean>[]]
}

export type DiscriminatedUnionDefinition = BaseDefinition & {
  kind: 'discriminatedUnion'
  discriminator: string
  expected: string
  map: Map<unknown, StructLike<unknown, unknown, boolean>>
  options: readonly [StructLike<unknown, unknown, boolean>, ...StructLike<unknown, unknown, boolean>[]]
}

export type IntersectionDefinition = BaseDefinition & {
  kind: 'intersection'
  left: StructLike<unknown, unknown, boolean>
  right: StructLike<unknown, unknown, boolean>
}

export type StructDefinition =
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
  issues: StructIssue[]
  ok: false
}

export type ParseSuccess<T> = {
  ok: true
  value: T
}

export type ParseResult<T> = ParseFailure | ParseSuccess<T>

export type RuntimeStruct = {
  readonly [DEFINITION]: StructDefinition
  readonly _struct: StructTypes<unknown, unknown, boolean>
  alias(name: string): RuntimeStruct
  null(): RuntimeStruct
  nullish(): RuntimeStruct
  optional(): RuntimeStruct
}

import type { StructError } from './errors'
import type { ResolvedStructField } from './fields'
import type { DEFINITION } from './symbols'

export type Path = Array<number | string>
export type ParseMode = 'field' | 'value'

/**
 * Error-first parse tuple from `struct.parse`.
 *
 * On success the error is `null` and `value` is the parsed output. On failure
 * the error is a `StructError` and `value` is always `undefined`.
 */
export type ParseResult<O> = [error: null, value: O] | [error: StructError, value: undefined]
export type LiteralValue = boolean | null | number | string

export interface StructTypes<Input = unknown, Output = unknown, OptionalOut extends boolean = false> {
  input: Input
  optionalOut: OptionalOut extends true ? true : undefined
  output: Output
}

/**
 * Minimal structural brand carried by every struct instance.
 *
 * `_struct` holds input/output phantom types used by `Infer` and `StructInput`.
 */
export interface StructLike<I = unknown, O = unknown, OO extends boolean = boolean> {
  readonly _struct: StructTypes<I, O, OO>
}

export type AnyStructLike = StructLike<unknown, unknown, boolean>

export type OptionalOutputStruct = {
  readonly _struct: {
    readonly optionalOut: true
  }
}

/**
 * A single validation failure produced while parsing a struct.
 */
export interface StructIssue {
  /** Machine-readable failure category. */
  code: 'custom' | 'invalid_enum' | 'invalid_literal' | 'invalid_type' | 'invalid_union' | 'missing_key'
  /** Human-readable description of the expected type or value. */
  expected: string
  /** Final message after optional `ErrorMap` rewriting. */
  message: string
  /** Path from the parse root to the failing location. */
  path: Path
  /** Value that failed validation at `path`. */
  received: unknown
}

/**
 * Nested error tree returned by `StructError.format()`.
 *
 * Leaf messages live under `_errors`; nested keys mirror the failing path.
 */
export interface FormattedStructError {
  _errors: string[]
  [key: string]: FormattedStructError | string[]
}

/**
 * Flat field/form error bags returned by `StructError.flatten()`.
 */
export interface FlattenedStructError {
  /** Messages whose path is empty (root-level issues). */
  formErrors: string[]
  /** Messages keyed by the first path segment. */
  fieldErrors: { [key: string]: string[] }
}

/**
 * Chainable modifiers available on every `Struct` instance.
 */
export interface StructMethods<I, O, OO extends boolean> {
  /**
   * Override the external wire name for this field without changing the TypeScript property name.
   *
   * @param name - Wire / protocol field name.
   * @returns The same struct branded with the alias.
   */
  alias(name: string): Struct<I, O, OO>
  /**
   * Allow `null` in addition to the current input and output types.
   *
   * @returns A struct that accepts and emits `null`.
   */
  null(): Struct<I | null, O | null, OO>
  /**
   * Alias for {@link StructMethods.null}.
   *
   * @returns A struct that accepts and emits `null`.
   */
  nullable(): Struct<I | null, O | null, OO>
  /**
   * Allow `null` or `undefined`, marking the field optional in object output.
   *
   * @returns A struct that accepts `null`/`undefined` and treats the field as optional.
   */
  nullish(): Struct<I | null | undefined, O | null | undefined, true>
  /**
   * Allow `undefined`, marking the field optional in object shapes.
   *
   * @returns A struct that accepts `undefined` and treats the field as optional.
   */
  optional(): Struct<I | undefined, O | undefined, true>
}

/**
 * Public struct contract: modifiers plus the `_struct` type brand.
 *
 * Built via the `struct` facade (`struct.string()`, `struct.object()`, …).
 */
export type Struct<Input = unknown, Output = Input, OptionalOut extends boolean = false> = StructMethods<Input, Output, OptionalOut> &
  StructLike<Input, Output, OptionalOut>

export type PresentValue = NonNullable<unknown>

/**
 * Broad struct constraint for endpoint and client generics.
 *
 * Prefer a concrete `Struct<…>` when you need precise input/output inference.
 */
// Type boundary: AnyStruct is the broad constraint used by endpoint generics. The concrete struct.any()
// return type excludes nullish input until a modifier explicitly adds it.
// oxlint-disable-next-line typescript/no-explicit-any
export type AnyStruct = Struct<any, any, boolean>

/**
 * Infer the accepted input type of a struct.
 *
 * @typeParam T - A struct-like value with a `_struct.input` brand.
 */
export type StructInput<T> = T extends { readonly _struct: { readonly input: unknown } } ? T['_struct']['input'] : never
type StructOutput<T> = T extends { readonly _struct: { readonly output: unknown } } ? T['_struct']['output'] : never

/**
 * Infer the parsed output type of a struct (alias of the internal output brand).
 *
 * @typeParam T - A struct-like value with a `_struct.output` brand.
 */
export type Infer<T> = StructOutput<T>

// Type boundary: FieldOutput inspects the generic struct surface; `unknown` lets the
// conditional type match any StructLike without over-constraining callers.
export type FieldOutput<S> =
  S extends StructLike<unknown, unknown, boolean>
    ? S extends OptionalOutputStruct
      ? Exclude<S['_struct']['output'], undefined>
      : S['_struct']['output']
    : never

export type Simplify<T> = { [K in keyof T]: T[K] } & {}

// Type boundary: ObjectShape accepts any field struct type; `any` is the only way to express "a record whose
// values are arbitrary struct instances" before the caller provides a concrete shape.
// oxlint-disable-next-line typescript/no-explicit-any
export type ObjectShape = { [key: string]: any }

export type ObjectInput<T extends ObjectShape> = Simplify<
  {
    -readonly [K in keyof T as T[K] extends OptionalOutputStruct ? never : K]: T[K]['_struct']['input']
  } & {
    -readonly [K in keyof T as T[K] extends OptionalOutputStruct ? K : never]?: Exclude<T[K]['_struct']['input'], undefined>
  }
>

export type ObjectOutput<T extends ObjectShape> = Simplify<
  {
    -readonly [K in keyof T as T[K] extends OptionalOutputStruct ? never : K]: FieldOutput<T[K]>
  } & {
    -readonly [K in keyof T as T[K] extends OptionalOutputStruct ? K : never]?: FieldOutput<T[K]>
  }
>

export type TupleInput<T extends readonly StructLike<unknown, unknown, boolean>[]> = {
  -readonly [K in keyof T]: StructInput<T[K]>
}

export type TupleOutput<T extends readonly StructLike<unknown, unknown, boolean>[]> = {
  -readonly [K in keyof T]: StructOutput<T[K]>
}

export type UnionOutput<T extends readonly StructLike<unknown, unknown, boolean>[]> = Exclude<StructOutput<T[number]>, undefined>

export type UnionInput<T extends readonly StructLike<unknown, unknown, boolean>[]> = Exclude<StructInput<T[number]>, undefined>

type IntersectionInputValue<T extends readonly StructLike<unknown, unknown, boolean>[]> = T extends readonly [
  infer Head extends StructLike<unknown, unknown, boolean>,
  ...infer Tail extends StructLike<unknown, unknown, boolean>[],
]
  ? StructInput<Head> & IntersectionInputValue<Tail>
  : unknown

export type IntersectionInput<T extends readonly StructLike<unknown, unknown, boolean>[]> = Exclude<IntersectionInputValue<T>, undefined>

type IntersectionOutputValue<T extends readonly StructLike<unknown, unknown, boolean>[]> = T extends readonly [
  infer Head extends StructLike<unknown, unknown, boolean>,
  ...infer Tail extends StructLike<unknown, unknown, boolean>[],
]
  ? StructOutput<Head> & IntersectionOutputValue<Tail>
  : unknown

export type IntersectionOutput<T extends readonly StructLike<unknown, unknown, boolean>[]> = Exclude<IntersectionOutputValue<T>, undefined>

export type StringStruct = Struct<string, string>

export type NumberStruct = Struct<number, number>

export type UnknownStruct = Struct<PresentValue, unknown>

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

/**
 * Object-shaped struct produced by `struct.object(shape)`.
 *
 * Field presence follows each field's optional/nullish modifiers; wire names
 * can differ from TypeScript keys via `.alias()`.
 */
export interface ObjectStruct<T extends ObjectShape>
  extends StructMethods<ObjectInput<T>, ObjectOutput<T>, false>, StructLike<ObjectInput<T>, ObjectOutput<T>, false> {
  readonly _struct: ObjectStructTypes<T>
}

export type RequestBodyCodec = 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text' | 'urlencoded'
export const REQUEST_SECTION_KEYS = ['path', 'query', 'headers', 'body'] as const

export type RequestBodyDescriptor = {
  codec: RequestBodyCodec
  contentType?: string | null
  struct: RuntimeStruct
}
export interface RequestBodyStructTypes<C extends RequestBodyCodec, S extends StructLike<unknown, unknown, boolean>> extends StructTypes<
  Exclude<StructInput<S>, undefined>,
  Exclude<StructOutput<S>, undefined>,
  false
> {
  codec: C
  input: Exclude<StructInput<S>, undefined>
  optionalOut: undefined
  output: Exclude<StructOutput<S>, undefined>
}

export interface RequestBodyStruct<C extends RequestBodyCodec, S extends StructLike<unknown, unknown, boolean>>
  extends
    StructMethods<Exclude<StructInput<S>, undefined>, Exclude<StructOutput<S>, undefined>, false>,
    StructLike<Exclude<StructInput<S>, undefined>, Exclude<StructOutput<S>, undefined>, false> {
  readonly _struct: RequestBodyStructTypes<C, S>
}

export type RequestBinaryBodyStruct = Struct<ArrayBuffer, ArrayBuffer> | Struct<Blob, Blob>
export type RequestBodyShapeStruct = RequestBinaryBodyStruct | RequestBodyStruct<RequestBodyCodec, StructLike<unknown, unknown, boolean>>

export type RequestShape = {
  body?: RequestBodyShapeStruct
  headers?: ObjectStruct<ObjectShape>
  path?: ObjectStruct<ObjectShape>
  query?: ObjectStruct<ObjectShape>
}

type RequestObjectSectionInput<TKey extends 'headers' | 'path' | 'query', TSection> =
  TSection extends ObjectStruct<ObjectShape>
    ? {} extends StructInput<TSection>
      ? { [K in TKey]?: StructInput<TSection> }
      : { [K in TKey]: StructInput<TSection> }
    : {}

export type RequestInput<T extends RequestShape> = Simplify<
  RequestObjectSectionInput<'path', T['path']> &
    RequestObjectSectionInput<'query', T['query']> &
    RequestObjectSectionInput<'headers', T['headers']> &
    (T['body'] extends StructLike<unknown, unknown, boolean> ? { body: StructInput<T['body']> } : {})
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

/**
 * Request-section struct produced by `struct.request({ path, query, headers, body })`.
 *
 * Groups path, query, headers, and body contracts used by HTTP/SSE/WebSocket builders.
 */
export interface RequestStruct<T extends RequestShape>
  extends StructMethods<RequestInput<T>, RequestOutput<T>, false>, StructLike<RequestInput<T>, RequestOutput<T>, false> {
  readonly _struct: RequestStructTypes<T>
}

export type RecordStruct<S extends StructLike<unknown, unknown, boolean>> = Struct<
  { [key: string]: StructInput<S> },
  { [key: string]: FieldOutput<S> }
>
export type TupleStruct<T extends readonly StructLike<unknown, unknown, boolean>[]> = Struct<TupleInput<T>, TupleOutput<T>>
export type UnionStruct<T extends readonly StructLike<unknown, unknown, boolean>[]> = Struct<UnionInput<T>, UnionOutput<T>>
export type DiscriminatedUnionStruct<TOptions extends readonly ObjectStruct<ObjectShape>[]> = Struct<
  StructInput<TOptions[number]>,
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
  decode?: (value: TInput, path: Path) => InternalParseResult<TOutput>
  encode?: (value: TOutput) => unknown
  expected: string
  is: (value: unknown) => value is TInput
  kind: K
  runtimeIs?: (value: unknown) => boolean
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
  contentType?: string | null
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
  issue: StructIssue
  ok: false
}

export type ParseSuccess<T> = {
  ok: true
  value: T
}

export type InternalParseResult<T> = ParseFailure | ParseSuccess<T>

export type RuntimeStruct = {
  readonly [DEFINITION]: StructDefinition
  readonly _struct: StructTypes<unknown, unknown, boolean>
  alias(name: string): RuntimeStruct
  null(): RuntimeStruct
  nullable(): RuntimeStruct
  nullish(): RuntimeStruct
  optional(): RuntimeStruct
}

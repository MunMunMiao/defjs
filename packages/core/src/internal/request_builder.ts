import type { SelectKeys } from './utility_types'
import type { AnyStruct, RequestBodyCodec as StructRequestBodyCodec } from '../struct'
import type { RequestDefinition } from '../struct/types'
import { getWireKey } from '../struct/codec/common'
import { encodeValue } from '../struct/encode'
import { getStructFields } from '../struct/introspection'
import { resolveObjectShape } from '../struct/shape'
import { DEFINITION } from '../struct/symbols'
import { HeaderTag, JsonTag, MultipartTag, QueryTag, UriTag, UrlencodedTag } from '../struct/tag'
import type { RuntimeSchema, SchemaLike } from '../struct/types'
import { hasOwnKey, isPlainObject } from '../struct/utils'
import type { HttpRequest } from './http_request'
import type {
  RequestBodyOptions,
  RequestBuildValue,
  RequestFormDataFileLike,
  RequestFormDataScalar,
  RequestFormDataValue,
} from './request_values'

type RequestFormDataArrayItem = RequestFormDataScalar | RequestFormDataFileLike

export type RequestTransport = 'http' | 'sse' | 'webSocket'

export interface RequestAutoBuildOptions {
  input?: AnyStruct
  transport?: RequestTransport
}

const BOUND_SOURCE = Symbol('defjs.request.boundSource')
const ARRAY_PROJECTION = Symbol('defjs.request.arrayProjection')

type BoundPathSegment = string | symbol

type BoundSource = {
  readonly [BOUND_SOURCE]: {
    readonly owner: symbol
    readonly path: readonly BoundPathSegment[]
    readonly schema: RuntimeSchema
  }
}

type ArrayProjection = {
  readonly [ARRAY_PROJECTION]: {
    readonly itemProjection: unknown
    readonly itemToken: symbol
    readonly source: BoundSource
  }
}

type BuildBoundRef<TOutput = unknown> = {
  readonly [BOUND_SOURCE]: {
    readonly output: TOutput
  }
}

export type BuildArrayProjection<TItem> = {
  readonly [ARRAY_PROJECTION]: never
  readonly item: TItem
}

export type BuildArray<TItem, TOutput extends readonly unknown[]> = BuildBoundRef<TOutput> & {
  map<TProjection>(callback: (item: TItem) => TProjection): BuildArrayProjection<TProjection>
}

export type BuildInput<T> = T extends { readonly _struct: { readonly output: infer TOutput } } ? BuildOutput<TOutput> : BuildBoundRef

type BuildOutput<TOutput> = TOutput extends readonly (infer TItem)[]
  ? BuildArray<BuildOutput<TItem>, TOutput>
  : TOutput extends { [key: string]: unknown }
    ? BuildBoundRef & { readonly [K in keyof TOutput]: BuildOutput<TOutput[K]> }
    : BuildBoundRef<TOutput>

type BuildScope = ReadonlyMap<symbol, unknown>
type BuildFlatScalar = bigint | boolean | Date | null | number | string | undefined
type BuildFlatValue = BuildFlatScalar | readonly BuildFlatScalar[]
type BuildFormDataValue = BuildFlatValue | Blob | File | readonly (Blob | BuildFlatScalar | File)[]

export type BuildJsonProjection =
  | BuildArrayProjection<unknown>
  | BuildBoundRef
  | undefined
  | readonly BuildJsonProjection[]
  | {
      readonly [key: string]: BuildJsonProjection
    }

export type BuildRecordProjection = {
  readonly [key: string]: BuildBoundRef<BuildFlatValue> | undefined
}

export type BuildFormDataProjection = {
  readonly [key: string]: BuildBoundRef<BuildFormDataValue> | undefined
}

type BuildPlanStep =
  | { bodyKind: 'arrayBuffer' | 'blob'; contentType?: string | null; kind: 'body'; value: unknown }
  | { kind: 'addFormData'; projection: unknown }
  | { contentType?: string | null; kind: 'addFormUrlEncoded'; projection: unknown }
  | { kind: 'addHeaders'; projection: unknown }
  | { kind: 'formData'; projection: unknown }
  | { contentType?: string | null; kind: 'formUrlEncoded'; projection: unknown }
  | { kind: 'headers'; projection: HeadersInit | { [key: string]: unknown } | unknown }
  | { contentType?: string | null; kind: 'html'; projection: unknown }
  | { contentType?: string | null; kind: 'json'; projection: unknown }
  | { kind: 'pathParams'; projection: unknown }
  | { kind: 'queryParams'; projection: unknown }
  | { contentType?: string | null; kind: 'text'; projection: unknown }

export interface RequestBuilder {
  addFormData(projection: BuildFormDataProjection): void
  addFormUrlEncoded(projection: BuildRecordProjection, options?: RequestBodyOptions): void
  addHeaders(projection: BuildRecordProjection): void
  setArrayBuffer(value: BuildBoundRef<ArrayBuffer>, options?: RequestBodyOptions): void
  setBlob(value: BuildBoundRef<Blob>, options?: RequestBodyOptions): void
  setFormData(projection: BuildFormDataProjection): void
  setFormUrlEncoded(projection: BuildRecordProjection, options?: RequestBodyOptions): void
  setHeaders(projection: BuildRecordProjection): void
  setHtml(value: BuildBoundRef<string>, options?: RequestBodyOptions): void
  setJson(projection: BuildJsonProjection, options?: RequestBodyOptions): void
  setPathParams(projection: BuildRecordProjection): void
  setQueryParams(projection: BuildRecordProjection): void
  setText(value: BuildBoundRef<string>, options?: RequestBodyOptions): void
}

export type RequestBuild = {
  body?: HttpRequest['body']
  bodyContentType?: string | null
  headers?: Headers
  params?: { [key: string]: RequestBuildValue }
  query?: { [key: string]: RequestBuildValue }
  withCredentials?: boolean
}

export type RequestBuildInput<TInput extends AnyStruct | undefined> = [TInput] extends [undefined]
  ? unknown
  : TInput extends AnyStruct
    ? BuildInput<TInput>
    : never

export type RequestBuildContext<TTransport extends RequestTransport = 'http'> = TTransport extends 'webSocket'
  ? SelectKeys<RequestBuilder, 'setPathParams' | 'setQueryParams'>
  : TTransport extends 'sse'
    ? SelectKeys<RequestBuilder, 'setHeaders' | 'addHeaders' | 'setPathParams' | 'setQueryParams'>
    : RequestBuilder

export type RequestBuildHandler<TInput extends AnyStruct | undefined, TTransport extends RequestTransport = 'http'> = (
  request: RequestBuildContext<TTransport>,
  input: RequestBuildInput<TInput>,
) => void

type RequestBuilderState = {
  snapshot: RequestBuild
}

export function buildRequest<TInput extends AnyStruct | undefined, TTransport extends RequestTransport = 'http'>(
  input: unknown,
  build: RequestBuildHandler<TInput, TTransport> | undefined,
  options: RequestAutoBuildOptions & { input?: TInput; transport?: TTransport },
): RequestBuild {
  const transport = resolveTypedBuildTransport(options.transport)

  if (!build) {
    return buildDefaultRequest(input, options, transport)
  }

  if (!options.input) {
    throw new Error('build() requires a struct input')
  }

  const state: RequestBuilderState = {
    snapshot: {},
  }

  const owner = Symbol('buildInput')
  const plan: BuildPlanStep[] = []
  const boundInput = createTypedBuildInput(options.input as TInput & AnyStruct, owner)
  build(createTypedBuildContext(plan, transport), boundInput)
  materializeBuildPlan(plan, input, state, owner)
  assertTransportBuild(state.snapshot, transport)
  return state.snapshot
}

function resolveTypedBuildTransport<TTransport extends RequestTransport>(transport: TTransport | undefined): TTransport {
  // Type boundary: the public default transport is HTTP; omitting options.transport is equivalent to passing 'http'.
  return (transport ?? 'http') as TTransport
}

function createTypedBuildContext<TTransport extends RequestTransport>(
  plan: BuildPlanStep[],
  _transport: TTransport,
): RequestBuildContext<TTransport> {
  // Type boundary: assertTransportBuild validates transport-specific output after materialization; the builder object exposes
  // the superset of methods internally and is narrowed here to the transport-specific public build context.
  return createBuildPlanBuilder(plan) as RequestBuildContext<TTransport>
}

function createTypedBuildInput<TInput extends AnyStruct>(schema: TInput, owner: symbol): RequestBuildInput<TInput> {
  // Type boundary: createBoundView materializes a runtime proxy from the same schema used by RequestBuildInput's conditional type.
  return createBoundView(schema as unknown as RuntimeSchema, [], owner) as RequestBuildInput<TInput>
}

function buildDefaultRequest<TInput>(input: TInput, options: RequestAutoBuildOptions, transport: RequestTransport): RequestBuild {
  if (!options.input) {
    return {}
  }

  const runtime = options.input as RuntimeSchema
  const definition = runtime[DEFINITION]

  if (definition.kind === 'request') {
    return buildRequestShape(input, definition, transport)
  }

  return {}
}

function buildRequestShape<TInput>(
  input: TInput,
  definition: RequestDefinition,
  transport: RequestTransport,
): RequestBuild {
  assertRequestShapeTransport(definition, transport)

  const state: RequestBuilderState = {
    snapshot: {},
  }
  const requestInput: { [key: string]: unknown } = isPlainObject(input) ? input : {}

  if (definition.path) {
    setPathParamsState(state, encodeFlatRecord(definition.path as RuntimeSchema, requestInput['path'], 'path'))
  }
  if (definition.query) {
    setQueryParamsState(state, encodeFlatRecord(definition.query as RuntimeSchema, requestInput['query'], 'query'))
  }
  if (definition.headers) {
    setHeadersState(state, encodeFlatRecord(definition.headers as RuntimeSchema, requestInput['headers'], 'headers'))
  }
  if (definition.body) {
    setRequestShapeBody(state, definition.body as RuntimeSchema, requestInput['body'])
  }

  assertTransportBuild(state.snapshot, transport)
  return state.snapshot
}

function setRequestShapeBody(state: RequestBuilderState, bodySchema: RuntimeSchema, bodyValue: unknown): void {
  const body = resolveRequestBody(bodySchema)
  switch (body.codec) {
    case 'json':
      setJsonBody(state, encodeKeyedValue(body.schema, bodyValue))
      return
    case 'urlencoded':
      setFormUrlEncodedBody(state, encodeFlatRecord(body.schema, bodyValue, 'urlencoded'))
      return
    case 'formData':
      setFormDataBody(state, encodeFlatRecord(body.schema, bodyValue, 'formData') as { [key: string]: RequestFormDataValue })
      return
    case 'text':
      setTextBody(state, String(encodeValue(body.schema, bodyValue) ?? ''))
      return
    case 'blob':
    case 'arrayBuffer':
      setRawBody(state, encodeValue(body.schema, bodyValue) as HttpRequest['body'])
      return
  }
}

function setJsonBody(state: RequestBuilderState, value: unknown, options?: RequestBodyOptions): void {
  setBody(state, JSON.stringify(value) as HttpRequest['body'], resolveBodyContentTypeOption(options, 'application/json'))
}

function setTextBody(state: RequestBuilderState, value: string, options?: RequestBodyOptions): void {
  setBody(state, value, resolveBodyContentTypeOption(options, 'text/plain;charset=UTF-8'))
}

function setHtmlBody(state: RequestBuilderState, value: string, options?: RequestBodyOptions): void {
  setBody(state, value, resolveBodyContentTypeOption(options, 'text/html;charset=UTF-8'))
}

function setRawBody(state: RequestBuilderState, value: HttpRequest['body'], options?: RequestBodyOptions): void {
  setBody(state, value, options?.contentType)
}

function setFormDataBody(state: RequestBuilderState, record: { [key: string]: RequestFormDataValue }): void {
  /* istanbul ignore next -- unreachable: FormData is available in all target runtimes */
  if (typeof FormData === 'undefined') {
    throw new Error('FormData is not supported in current runtime')
  }

  const body = new FormData()
  for (const [key, value] of Object.entries(record)) {
    appendRequestFormDataValue(body, key, value)
  }

  setBody(state, body)
}

function setFormUrlEncodedBody(
  state: RequestBuilderState,
  record: { [key: string]: RequestBuildValue },
  options?: RequestBodyOptions,
): void {
  const body = new URLSearchParams()
  setBody(state, body, resolveBodyContentTypeOption(options, 'application/x-www-form-urlencoded;charset=UTF-8'))
  for (const [key, value] of Object.entries(record)) {
    appendUrlEncodedBodyValue(body, key, value)
  }
}

function setHeadersState(state: RequestBuilderState, record: { [key: string]: RequestBuildValue }): void {
  const headers = new Headers()
  appendHeaders(headers, record)
  state.snapshot.headers = headers
}

function setPathParamsState(state: RequestBuilderState, record: { [key: string]: RequestBuildValue }): void {
  state.snapshot.params = { ...record }
}

function setQueryParamsState(state: RequestBuilderState, record: { [key: string]: RequestBuildValue }): void {
  state.snapshot.query = { ...record }
}

function addHeadersState(state: RequestBuilderState, record: { [key: string]: RequestBuildValue }): void {
  if (!state.snapshot.headers) {
    state.snapshot.headers = new Headers()
  }
  appendHeaders(state.snapshot.headers, record)
}

function addFormDataBody(state: RequestBuilderState, record: { [key: string]: RequestFormDataValue }): void {
  /* istanbul ignore next -- unreachable: FormData is available in all target runtimes */
  if (typeof FormData === 'undefined') {
    throw new Error('FormData is not supported in current runtime')
  }

  const body = state.snapshot.body instanceof FormData ? state.snapshot.body : new FormData()
  for (const [key, value] of Object.entries(record)) {
    appendRequestFormDataValue(body, key, value)
  }

  setBody(state, body)
}

function addFormUrlEncodedBody(
  state: RequestBuilderState,
  record: { [key: string]: RequestBuildValue },
  options?: RequestBodyOptions,
): void {
  const body = state.snapshot.body instanceof URLSearchParams ? state.snapshot.body : new URLSearchParams()
  for (const [key, value] of Object.entries(record)) {
    appendUrlEncodedBodyValue(body, key, value)
  }
  setBody(state, body, resolveBodyContentTypeOption(options, 'application/x-www-form-urlencoded;charset=UTF-8'))
}

function createBuildPlanBuilder(plan: BuildPlanStep[]): RequestBuilder {
  return {
    addFormData(projection) {
      plan.push({ kind: 'addFormData', projection })
    },
    addFormUrlEncoded(projection, options) {
      plan.push({ contentType: options?.contentType, kind: 'addFormUrlEncoded', projection })
    },
    addHeaders(projection) {
      plan.push({ kind: 'addHeaders', projection })
    },
    setArrayBuffer(value, options) {
      plan.push({ bodyKind: 'arrayBuffer', contentType: options?.contentType, kind: 'body', value })
    },
    setBlob(value, options) {
      plan.push({ bodyKind: 'blob', contentType: options?.contentType, kind: 'body', value })
    },
    setFormData(projection) {
      plan.push({ kind: 'formData', projection })
    },
    setFormUrlEncoded(projection, options) {
      plan.push({ contentType: options?.contentType, kind: 'formUrlEncoded', projection })
    },
    setHeaders(projection) {
      plan.push({ kind: 'headers', projection })
    },
    setHtml(value, options) {
      plan.push({ contentType: options?.contentType, kind: 'html', projection: value })
    },
    setJson(projection, options) {
      plan.push({ contentType: options?.contentType, kind: 'json', projection })
    },
    setPathParams(projection) {
      plan.push({ kind: 'pathParams', projection })
    },
    setQueryParams(projection) {
      plan.push({ kind: 'queryParams', projection })
    },
    setText(value, options) {
      plan.push({ contentType: options?.contentType, kind: 'text', projection: value })
    },
  }
}

function materializeBuildPlan(plan: readonly BuildPlanStep[], input: unknown, state: RequestBuilderState, owner: symbol): void {
  const scope = new Map<symbol, unknown>()

  for (const step of plan) {
    switch (step.kind) {
      case 'addFormData':
        addFormDataBody(
          state,
          materializeRecordProjection(step.projection, input, scope, 'formData', owner) as { [key: string]: RequestFormDataValue },
        )
        break
      case 'addFormUrlEncoded':
        addFormUrlEncodedBody(state, materializeRecordProjection(step.projection, input, scope, 'urlencoded', owner), {
          contentType: step.contentType,
        })
        break
      case 'addHeaders':
        addHeadersState(state, materializeHeadersProjection(step.projection, input, scope, owner))
        break
      case 'body': {
        const body = materializeProjection(step.value, input, scope, 'body', owner)
        assertSingleBodyValue(step.bodyKind, body)
        setRawBody(state, body as HttpRequest['body'], { contentType: step.contentType })
        break
      }
      case 'formData':
        setFormDataBody(
          state,
          materializeRecordProjection(step.projection, input, scope, 'formData', owner) as { [key: string]: RequestFormDataValue },
        )
        break
      case 'formUrlEncoded':
        setFormUrlEncodedBody(state, materializeRecordProjection(step.projection, input, scope, 'urlencoded', owner), {
          contentType: step.contentType,
        })
        break
      case 'headers':
        setHeadersState(state, materializeHeadersProjection(step.projection, input, scope, owner))
        break
      case 'html':
        setHtmlBody(state, materializeSingleTextProjection(step.projection, input, scope, 'html', owner), { contentType: step.contentType })
        break
      case 'json':
        setJsonBody(state, materializeProjection(step.projection, input, scope, 'json', owner), { contentType: step.contentType })
        break
      case 'pathParams':
        setPathParamsState(state, materializeRecordProjection(step.projection, input, scope, 'path', owner))
        break
      case 'queryParams':
        setQueryParamsState(state, materializeRecordProjection(step.projection, input, scope, 'query', owner))
        break
      case 'text':
        setTextBody(state, materializeSingleTextProjection(step.projection, input, scope, 'text', owner), { contentType: step.contentType })
        break
    }
  }
}

function createBoundView(schema: RuntimeSchema, path: readonly BoundPathSegment[], owner: symbol): unknown {
  const definition = schema[DEFINITION]
  if (definition.kind === 'requestBody') {
    return createBoundView(definition.schema as RuntimeSchema, path, owner)
  }

  const view: { [key: PropertyKey]: unknown } = Object.create(null)
  Object.defineProperty(view, BOUND_SOURCE, {
    enumerable: false,
    value: { owner, path, schema },
  })

  if (definition.kind === 'request') {
    defineBoundSection(view, 'path', definition.path, path, owner)
    defineBoundSection(view, 'query', definition.query, path, owner)
    defineBoundSection(view, 'headers', definition.headers, path, owner)
    defineBoundSection(view, 'body', definition.body, path, owner)
  }

  if (definition.kind === 'object') {
    const shape = resolveObjectShape(schema, definition)
    for (const [key, field] of Object.entries(shape)) {
      Object.defineProperty(view, key, {
        enumerable: true,
        get: () => createBoundView(field as RuntimeSchema, [...path, key], owner),
      })
    }
  }

  if (definition.kind === 'array') {
    Object.defineProperty(view, 'map', {
      enumerable: false,
      value: (callback: (item: unknown) => unknown) => {
        const itemToken = Symbol('arrayItem')
        const itemView = createBoundView(definition.item as RuntimeSchema, [itemToken], owner)
        return {
          [ARRAY_PROJECTION]: {
            itemProjection: callback(itemView),
            itemToken,
            source: view as BoundSource,
          },
        } satisfies ArrayProjection
      },
    })
  }

  return view
}

function defineBoundSection(
  view: { [key: PropertyKey]: unknown },
  key: 'body' | 'headers' | 'path' | 'query',
  schema: SchemaLike<unknown, unknown, boolean> | undefined,
  path: readonly BoundPathSegment[],
  owner: symbol,
): void {
  if (!schema) {
    return
  }
  Object.defineProperty(view, key, {
    enumerable: true,
    get: () => createBoundView(schema as RuntimeSchema, [...path, key], owner),
  })
}

function materializeHeadersProjection(
  projection: unknown,
  input: unknown,
  scope: BuildScope,
  owner: symbol,
): { [key: string]: RequestBuildValue } {
  return materializeRecordProjection(projection, input, scope, 'headers', owner)
}

function materializeRecordProjection(
  projection: unknown,
  input: unknown,
  scope: BuildScope,
  target: 'formData' | 'headers' | 'path' | 'query' | 'urlencoded',
  owner: symbol,
): { [key: string]: RequestBuildValue } {
  if (isBoundSource(projection)) {
    const source = projection[BOUND_SOURCE]
    assertBoundOwner(source, owner)
    return encodeFlatRecord(source.schema, readBoundSource(source, input, scope), target)
  }

  if (!isPlainObject(projection)) {
    throw new Error(`${target} binding expects an object projection`)
  }

  const output: { [key: string]: RequestBuildValue } = Object.create(null)
  for (const [key, value] of Object.entries(projection)) {
    const materialized = materializeProjection(value, input, scope, target, owner)
    if (typeof materialized !== 'undefined') {
      assertFlatValue(target, key, materialized)
      output[key] = materialized as RequestBuildValue
    }
  }
  return output
}

function materializeProjection(projection: unknown, input: unknown, scope: BuildScope, target: string, owner: symbol): unknown {
  if (isBoundSource(projection)) {
    const source = projection[BOUND_SOURCE]
    assertBoundOwner(source, owner)
    return encodeSourceValue(source.schema, readBoundSource(source, input, scope), target)
  }

  if (isArrayProjection(projection)) {
    const arrayProjection = projection[ARRAY_PROJECTION]
    assertBoundOwner(arrayProjection.source[BOUND_SOURCE], owner)
    const sourceValue = readBoundSource(arrayProjection.source[BOUND_SOURCE], input, scope)
    if (!Array.isArray(sourceValue)) {
      throw new Error('ArrayProjection source must resolve to an array')
    }
    return sourceValue.map((item) => {
      const nextScope = new Map(scope)
      nextScope.set(arrayProjection.itemToken, item)
      return materializeProjection(arrayProjection.itemProjection, input, nextScope, target, owner)
    })
  }

  if (Array.isArray(projection)) {
    return projection.map((item) => materializeProjection(item, input, scope, target, owner))
  }

  if (isPlainObject(projection)) {
    const output: { [key: string]: unknown } = Object.create(null)
    for (const [key, value] of Object.entries(projection)) {
      const materialized = materializeProjection(value, input, scope, target, owner)
      if (typeof materialized !== 'undefined') {
        output[key] = materialized
      }
    }
    return output
  }

  if (typeof projection === 'undefined') {
    return undefined
  }

  throw new Error(`${target} binding values must come from build input`)
}

function materializeSingleTextProjection(
  projection: unknown,
  input: unknown,
  scope: BuildScope,
  target: 'html' | 'text',
  owner: symbol,
): string {
  const value = materializeProjection(projection, input, scope, target, owner)
  assertTextBodyValue(value)
  return value
}

function readBoundSource(source: BoundSource[typeof BOUND_SOURCE], input: unknown, scope: BuildScope): unknown {
  let current: unknown = input
  for (const segment of source.path) {
    if (typeof segment === 'symbol') {
      if (!scope.has(segment)) {
        throw new Error('ArrayProjection item fields can only be used inside the map() projection')
      }
      current = scope.get(segment)
      continue
    }
    current = isPlainObject(current) || Array.isArray(current) ? (current as { [key: string]: unknown })[segment] : undefined
  }
  return current
}

function assertBoundOwner(source: BoundSource[typeof BOUND_SOURCE], owner: symbol): void {
  if (source.owner !== owner) {
    throw new Error('build input binding belongs to a different build context')
  }
}

function encodeSourceValue(schema: RuntimeSchema, value: unknown, target: string): unknown {
  if (target === 'json') {
    return encodeKeyedValue(schema, value)
  }
  return encodeValue(schema, value)
}

function encodeKeyedValue(schema: RuntimeSchema, value: unknown): unknown {
  return encodeValue(schema, value, {
    encodeObject(objectStruct, objectValue, encodeChild) {
      const output: { [key: string]: unknown } = Object.create(null)
      for (const field of getStructFields(objectStruct)) {
        if (!hasOwnKey(objectValue, field.key)) {
          continue
        }
        const fieldValue = objectValue[field.key]
        if (typeof fieldValue === 'undefined') {
          continue
        }
        output[getWireKey(field.key, field.tags.get(JsonTag.kind))] = encodeChild(field.struct as RuntimeSchema, fieldValue)
      }
      return output
    },
  })
}

function encodeFlatRecord(
  schema: RuntimeSchema,
  value: unknown,
  target: 'formData' | 'headers' | 'path' | 'query' | 'urlencoded',
): { [key: string]: RequestBuildValue } {
  const definition = schema[DEFINITION]
  if (definition.kind !== 'object') {
    throw new Error(`${target} binding expects an object struct`)
  }
  if (!isPlainObject(value)) {
    throw new Error(`${target} binding expects an object value`)
  }

  const output: { [key: string]: RequestBuildValue } = Object.create(null)
  for (const field of getStructFields(schema)) {
    if (!hasOwnKey(value, field.key)) {
      continue
    }
    const encoded = encodeValue(field.struct as RuntimeSchema, value[field.key])
    if (typeof encoded === 'undefined') {
      continue
    }
    const outputKey = getWireKey(field.key, field.tags.get(getFlatTargetTagKind(target)))
    assertFlatValue(target, outputKey, encoded)
    output[outputKey] = encoded as RequestBuildValue
  }
  return output
}

function assertFlatValue(target: string, key: string, value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertFlatValue(target, key, item)
    }
    return
  }
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    if (target === 'formData') {
      return
    }
    throw new Error(`${target} binding does not support binary value for key "${key}"`)
  }
  if (typeof value === 'object' && value !== null) {
    throw new Error(`${target} binding does not support nested object for key "${key}"`)
  }
}

function assertSingleBodyValue(kind: 'arrayBuffer' | 'blob', value: unknown): asserts value is ArrayBuffer | Blob {
  if (kind === 'arrayBuffer') {
    if (value instanceof ArrayBuffer) {
      return
    }
    throw new Error('setArrayBuffer() expects an ArrayBuffer field')
  }

  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return
  }
  throw new Error('setBlob() expects a Blob field')
}

function assertTextBodyValue(value: unknown): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error('text body binding expects a string field')
  }
}

function resolveRequestBody(schema: RuntimeSchema): { codec: StructRequestBodyCodec; schema: RuntimeSchema } {
  const definition = schema[DEFINITION]
  if (definition.kind === 'requestBody') {
    return {
      codec: definition.codec,
      schema: definition.schema as RuntimeSchema,
    }
  }
  if (definition.kind === 'blob') {
    return { codec: 'blob', schema }
  }
  /* istanbul ignore else -- unreachable: body wrappers are validated at construction time */
  if (definition.kind === 'arrayBuffer') {
    return { codec: 'arrayBuffer', schema }
  }
  /* istanbul ignore next -- unreachable: struct.request validates the body section at construction time */
  throw new Error('body binding requires a body wrapper schema')
}

function getFlatTargetTagKind(target: 'formData' | 'headers' | 'path' | 'query' | 'urlencoded'): symbol {
  switch (target) {
    case 'formData':
      return MultipartTag.kind
    case 'headers':
      return HeaderTag.kind
    case 'path':
      return UriTag.kind
    case 'query':
      return QueryTag.kind
    case 'urlencoded':
      return UrlencodedTag.kind
  }
}

function isBoundSource(value: unknown): value is BoundSource {
  return isPlainObject(value) && BOUND_SOURCE in value
}

function isArrayProjection(value: unknown): value is ArrayProjection {
  return isPlainObject(value) && ARRAY_PROJECTION in value
}

function assertRequestShapeTransport(definition: RequestDefinition, transport: RequestTransport): void {
  if (transport === 'sse' && definition.body) {
    throw new Error('SSE request input does not support body section')
  }
  if (transport === 'webSocket') {
    if (definition.headers) {
      throw new Error('WebSocket request input does not support headers section')
    }
    if (definition.body) {
      throw new Error('WebSocket request input does not support body section')
    }
  }
}

function assertTransportBuild(build: RequestBuild, transport: RequestTransport): void {
  if (transport === 'http') {
    return
  }

  if (transport === 'sse') {
    if (typeof build.body !== 'undefined' || typeof build.bodyContentType !== 'undefined') {
      throw new Error('SSE build() does not support request body')
    }
    /* istanbul ignore if -- unreachable: the builder never produces withCredentials */
    if (typeof build.withCredentials !== 'undefined') {
      throw new Error('SSE build() does not support withCredentials()')
    }
    return
  }

  if (
    typeof build.body !== 'undefined' ||
    typeof build.bodyContentType !== 'undefined' ||
    typeof build.headers !== 'undefined' ||
    typeof build.withCredentials !== 'undefined'
  ) {
    throw new Error('WebSocket build() only supports path params and query params')
  }
}

function setBody(state: RequestBuilderState, value: HttpRequest['body'], contentType?: string | null): void {
  state.snapshot.body = value
  state.snapshot.bodyContentType = contentType
}

function resolveBodyContentTypeOption(options: RequestBodyOptions | undefined, defaultContentType: string): string | null {
  return options?.contentType === undefined ? defaultContentType : options.contentType
}

function appendHeaders(headers: Headers, record: { [key: string]: RequestBuildValue }): void {
  for (const [key, headerValue] of Object.entries(record)) {
    /* istanbul ignore next -- unreachable: materializeRecordProjection filters undefined record values */
    if (typeof headerValue === 'undefined') {
      continue
    }

    if (Array.isArray(headerValue)) {
      for (const item of headerValue) {
        headers.append(key, serializeValue(item))
      }
      continue
    }

    headers.set(key, serializeValue(headerValue))
  }
}

function appendRequestFormDataValue(formData: FormData, key: string, value: RequestFormDataValue): void {
  /* istanbul ignore next -- unreachable: callers filter undefined record values */
  if (typeof value === 'undefined') {
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendRequestFormDataItem(formData, key, item as RequestFormDataArrayItem)
    }
    return
  }

  appendRequestFormDataItem(formData, key, value as RequestFormDataScalar | RequestFormDataFileLike)
}

function appendRequestFormDataItem(formData: FormData, key: string, value: RequestFormDataScalar | RequestFormDataFileLike): void {
  /* istanbul ignore next -- unreachable: caller already filters undefined values */
  if (typeof value === 'undefined') {
    return
  }

  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    formData.append(key, value)
    return
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
    formData.append(key, String(value))
    return
  }

  throw new Error(`formData binding does not support value for key "${key}"`)
}

function appendUrlEncodedBodyValue(searchParams: URLSearchParams, key: string, value: RequestBuildValue): void {
  /* istanbul ignore next -- unreachable: callers filter undefined record values */
  if (typeof value === 'undefined') {
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      searchParams.append(key, serializeValue(item))
    }
    return
  }

  searchParams.set(key, serializeValue(value))
}

function serializeValue(value: unknown): string {
  switch (true) {
    case typeof value === 'string':
      return value
    case typeof value === 'number':
    case typeof value === 'boolean':
      return String(value)
    case value === null:
      return 'null'
    /* istanbul ignore next -- unreachable: objects are rejected by assertFlatValue before serialization */
    case typeof value === 'object':
      return JSON.stringify(value)
    default:
      return String(value)
  }
}

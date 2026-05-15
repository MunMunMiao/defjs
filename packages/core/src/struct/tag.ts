export type TagScalar = boolean | number | string

export interface TagNamespace<TName extends string = string> {
  readonly kind: symbol
  readonly name: TName
}

export interface FieldTag<TName extends string = string> {
  readonly config: ReadonlyMap<string, TagScalar>
  readonly namespace: TagNamespace<TName>
  readonly value: TagScalar | undefined
}

export interface MutableFieldTag<TName extends string = string> {
  config: Map<string, TagScalar>
  namespace: TagNamespace<TName>
  value: TagScalar | undefined
}

export interface FieldTagContext {
  readonly fieldKey: string
  readonly tags: Map<symbol, MutableFieldTag>
}

export type FieldTagOption = (context: FieldTagContext) => void

type ValueTagFactory = (fieldName?: string) => FieldTagOption
type RequiredValueTagFactory = (fieldName: string) => FieldTagOption

type ValueTagOptions = {
  requireExplicitName?: boolean
}

const CONFIG_KEY_RE = /^[A-Za-z][A-Za-z0-9_.-]*$/

export const JsonTag = createTagNamespace('json')
export const QueryTag = createTagNamespace('query')
export const UriTag = createTagNamespace('uri')
export const HeaderTag = createTagNamespace('header')
export const UrlencodedTag = createTagNamespace('urlencoded')
export const MultipartTag = createTagNamespace('multipart')

export const tagKind = Object.freeze({
  header: HeaderTag.kind,
  json: JsonTag.kind,
  multipart: MultipartTag.kind,
  query: QueryTag.kind,
  uri: UriTag.kind,
  urlencoded: UrlencodedTag.kind,
})

export function createTagNamespace<const TName extends string>(name: TName): TagNamespace<TName> {
  if (!CONFIG_KEY_RE.test(name)) {
    throw new Error(`invalid tag namespace name: ${name}`)
  }

  return Object.freeze({
    kind: Symbol(`defjs.struct.tag.${name}`),
    name,
  })
}

export function defineConfig<const TName extends string>(namespace: TagNamespace<TName>) {
  return (key: string, value: TagScalar = true): FieldTagOption =>
    context => {
      assertConfigKey(key, namespace)

      const fieldTag = ensureTag(context.tags, namespace)
      fieldTag.config.set(key, value)
    }
}

export function materializeFieldTags(fieldKey: string, options: readonly FieldTagOption[]): ReadonlyMap<symbol, FieldTag> {
  const mutableTags = new Map<symbol, MutableFieldTag>()

  for (const option of options) {
    option({ fieldKey, tags: mutableTags })
  }

  return freezeFieldTags(mutableTags)
}

export const tag = Object.freeze({
  defineConfig,
  header: defineValueTag(HeaderTag, { requireExplicitName: true }) as RequiredValueTagFactory,
  json: defineValueTag(JsonTag),
  kind: tagKind,
  multipart: defineValueTag(MultipartTag),
  query: defineValueTag(QueryTag, { requireExplicitName: true }) as RequiredValueTagFactory,
  uri: defineValueTag(UriTag, { requireExplicitName: true }) as RequiredValueTagFactory,
  urlencoded: defineValueTag(UrlencodedTag),
})

function defineValueTag(namespace: TagNamespace, options: ValueTagOptions = {}): ValueTagFactory {
  return fieldName => context => {
    if (options.requireExplicitName && typeof fieldName !== 'string') {
      throw new Error(`tag.${namespace.name}() requires an explicit field name`)
    }

    const fieldTag = ensureTag(context.tags, namespace)
    fieldTag.value = fieldName ?? context.fieldKey
  }
}

function ensureTag<TName extends string>(tags: Map<symbol, MutableFieldTag>, namespace: TagNamespace<TName>): MutableFieldTag<TName> {
  const existing = tags.get(namespace.kind)
  if (existing) {
    return existing as MutableFieldTag<TName>
  }

  const created: MutableFieldTag<TName> = {
    config: new Map(),
    namespace,
    value: undefined,
  }

  tags.set(namespace.kind, created)
  return created
}

function freezeFieldTags(tags: Map<symbol, MutableFieldTag>): ReadonlyMap<symbol, FieldTag> {
  const result = new Map<symbol, FieldTag>()

  for (const [kind, fieldTag] of tags) {
    result.set(
      kind,
      Object.freeze({
        config: new Map(fieldTag.config),
        namespace: fieldTag.namespace,
        value: fieldTag.value,
      }),
    )
  }

  return result
}

function assertConfigKey(key: string, namespace: TagNamespace): void {
  if (!CONFIG_KEY_RE.test(key)) {
    throw new Error(`invalid ${namespace.name} tag config key: ${key}`)
  }
}

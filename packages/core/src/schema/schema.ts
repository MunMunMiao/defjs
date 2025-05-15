export const _metadata = Symbol('metadata')

export interface BaseMetadata<out O = unknown> {
  output: O
  default?: unknown
  alias?: string
  optional?: boolean
  validate?: (value: any) => Error | null | undefined
}

export interface Schema<out T = unknown> {
  readonly [_metadata]: BaseMetadata<T>
  default<Value extends T>(value: Value): this
  alias(alias: string): this
  optional(): Schema<this[typeof _metadata]['output'] | undefined>
  validate(fn: (value: Readonly<this[typeof _metadata]['output']>) => Error | null | undefined): this
  parse(value: unknown): value is this[typeof _metadata]['output']
}

export function isSchema<T>(value: any): value is Schema<T> {
  if (typeof value === "function"){
    return isSchema(value())
  }

  return value && typeof value === 'object' && _metadata in value
}

export function createSchema<M extends BaseMetadata>(metadata: M): Schema {
  const schema = {
    default: value => {
      metadata.default = value
      return schema
    },
    alias: alias => {
      metadata.alias = alias
      return schema
    },
    optional: () => {
      metadata.optional = true
      return schema
    },
    validate: (fn: (value: any) => Error | null | undefined) => {
      if (typeof fn !== 'function') {
        throw new Error('Validation function must be a function')
      }
      metadata.validate = fn
      return schema
    },
  } as Schema

  Object.defineProperty(schema, _metadata, {
    value: metadata,
    enumerable: false,
    writable: false,
    configurable: false,
  })

  return schema
}

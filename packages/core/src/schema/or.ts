import { type BaseMetadata, type Schema, _metadata, createSchema, isSchema } from './schema'

export type OrOutput<T extends Schema[]> = T extends [infer A, ...infer B]
  ? A extends Schema<infer O>
    ? B extends Schema[]
      ? O | OrOutput<B>
      : never
    : never
  : never

export interface OrMetadata<T extends Schema[]> extends BaseMetadata<OrOutput<T>> {
  kind: 'or'
  shapes: T
}

export interface OrSchema<T extends Schema[]> extends Schema {
  readonly [_metadata]: OrMetadata<T>
}

export function _or<const T extends Schema[]>(...shapes: T): OrSchema<T> {
  if (!shapes.every(v => isSchema(v))){
    throw new Error('shapes must be a schema')
  }

  const defaultValue = shapes.at(0)?.default
  const md = {
    kind: 'or',
    shapes,
    default: defaultValue
  } as OrMetadata<T>
  return createSchema(md) as OrSchema<T>
}

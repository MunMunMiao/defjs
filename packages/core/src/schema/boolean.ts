import { type BaseMetadata, type Schema, _metadata, createSchema } from './schema'

export interface BooleanMetadata extends BaseMetadata<boolean> {
  kind: 'boolean'
}

export interface BooleanSchema extends Schema {
  readonly [_metadata]: BooleanMetadata
}

export function _boolean(): BooleanSchema {
  const md = { kind: 'boolean', default: Boolean() } as BooleanMetadata
  return createSchema(md) as BooleanSchema
}

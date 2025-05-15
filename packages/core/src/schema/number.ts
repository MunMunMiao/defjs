import { type BaseMetadata, type Schema, _metadata, createSchema } from './schema'

export interface NumberMetadata extends BaseMetadata<number> {
  kind: 'number'
}

export interface NumberSchema extends Schema {
  readonly [_metadata]: NumberMetadata
}

export function _number(): NumberSchema {
  const md = { kind: 'number', default: Number() } as NumberMetadata
  return createSchema(md) as NumberSchema
}

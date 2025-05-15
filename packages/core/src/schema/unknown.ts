import { type BaseMetadata, type Schema, _metadata, createSchema } from './schema'

export interface UnknownMetadata extends BaseMetadata<unknown> {
  kind: 'unknown'
}

export interface UnknownSchema extends Schema {
  readonly [_metadata]: UnknownMetadata
}

export function _unknown(): UnknownSchema {
  const md = { kind: 'unknown' } as UnknownMetadata
  return createSchema(md) as UnknownSchema
}

import { type BaseMetadata, type Schema, _metadata, createSchema } from './schema'

export interface NullMetadata extends BaseMetadata<null> {
  kind: 'null'
}

export interface NullSchema extends Schema {
  readonly [_metadata]: NullMetadata
}

export function _null(): NullSchema {
  const md = { kind: 'null', default: null } as NullMetadata
  return createSchema(md) as unknown as NullSchema
}

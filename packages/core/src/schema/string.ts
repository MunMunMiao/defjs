import { type BaseMetadata, type Schema, _metadata, createSchema } from './schema'

export interface StringMetadata extends BaseMetadata<string> {
  kind: 'string'
}

export interface StringSchema extends Schema {
  readonly [_metadata]: StringMetadata
}

export function _string(): StringSchema {
  const md = { kind: 'string', default: String() } as StringMetadata
  return createSchema(md) as StringSchema
}

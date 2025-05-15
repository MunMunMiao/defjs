import { type BaseMetadata, type Schema, _metadata, createSchema } from './schema'

export interface AnyMetadata extends BaseMetadata<any> {
  kind: 'any'
}

export interface AnySchema extends Schema<any> {
  readonly [_metadata]: AnyMetadata
}

export function _any(): AnySchema {
  const md = { kind: 'any' } as AnyMetadata
  return createSchema(md) as AnySchema
}

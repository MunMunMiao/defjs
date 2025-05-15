import { type BaseMetadata, type Schema, _metadata, createSchema } from './schema'

export interface BlobMetadata extends BaseMetadata<Blob> {
  kind: 'blob'
}

export interface BlobSchema extends Schema {
  readonly [_metadata]: BlobMetadata
}

export function _blob(): BlobSchema {
  const md = { kind: 'blob' } as BlobMetadata
  return createSchema(md) as BlobSchema
}

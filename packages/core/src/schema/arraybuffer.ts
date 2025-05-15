import { type BaseMetadata, type Schema, _metadata, createSchema } from './schema'

export interface ArrayBufferMetadata extends BaseMetadata<ArrayBuffer> {
  kind: 'arraybuffer'
}

export interface ArrayBufferSchema extends Schema {
  readonly [_metadata]: ArrayBufferMetadata
}

export function _arraybuffer(): ArrayBufferSchema {
  const md = { kind: 'arraybuffer' } as ArrayBufferMetadata
  return createSchema(md) as ArrayBufferSchema
}

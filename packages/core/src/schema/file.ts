import { type BaseMetadata, type Schema, _metadata, createSchema } from './schema'

export interface FileMetadata extends BaseMetadata<File> {
  kind: 'file'
}

export interface FileSchema extends Schema {
  readonly [_metadata]: FileMetadata
}

export function _file(): FileSchema {
  const md = { kind: 'file' } as FileMetadata
  return createSchema(md) as FileSchema
}

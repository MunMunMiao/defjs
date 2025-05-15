import type { AnyMetadata } from './any'
import type { ArrayMetadata } from './array'
import type { ArrayBufferMetadata } from './arraybuffer'
import type { BlobMetadata } from './blob'
import type { BooleanMetadata } from './boolean'
import type { EnumMetadata } from './enum'
import type { FileMetadata } from './file'
import type { NullMetadata } from './null'
import type { NumberMetadata } from './number'
import type { ObjectMetadata } from './object'
import type { OrMetadata } from './or'
import type { RecordMetadata } from './record'
import { type BaseMetadata, type Schema, _metadata, isSchema } from './schema'
import type { StringMetadata } from './string'
import type { TupleMetadata } from './tuple'
import type { UnknownMetadata } from './unknown'

export type Metadata =
  | ArrayMetadata<any>
  | AnyMetadata
  | ArrayBufferMetadata
  | BlobMetadata
  | BooleanMetadata
  | EnumMetadata<any>
  | FileMetadata
  | NullMetadata
  | NumberMetadata
  | ObjectMetadata<any>
  | OrMetadata<any>
  | RecordMetadata<any>
  | StringMetadata
  | TupleMetadata<any, any>
  | UnknownMetadata

export function getMetadata<S extends Schema>(schema: S): Metadata
export function getMetadata(schema: unknown): BaseMetadata
export function getMetadata<S extends Schema>(schema: S): Metadata | BaseMetadata {
  if (!isSchema(schema)) {
    throw new Error('Invalid schema')
  }
  return schema[_metadata] as Metadata
}

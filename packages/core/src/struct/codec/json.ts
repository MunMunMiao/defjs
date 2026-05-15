import { JsonTag } from '../tag'
import type { ParseOptions, SchemaLike } from '../types'
import { decodeObjectByTag, encodeObjectByTag } from './common'

export interface JsonCodecOptions extends ParseOptions {
  requireTag?: boolean
}

export function encodeJson(struct: SchemaLike<any, any, boolean>, value: unknown, options: JsonCodecOptions = {}): unknown {
  return encodeObjectByTag(struct, value, JsonTag, options)
}

export function decodeJson(struct: SchemaLike<any, any, boolean>, value: unknown, options: JsonCodecOptions = {}): unknown {
  return decodeObjectByTag(struct, value, JsonTag, options)
}

import { JsonTag } from '../tag'
import type { SchemaLike } from '../types'
import { decodeObjectByTag, encodeObjectByTag } from './common'

export interface JsonCodecOptions {
  requireTag?: boolean
}

export function encodeJson(struct: SchemaLike<unknown, unknown, boolean>, value: unknown, options: JsonCodecOptions = {}): unknown {
  return encodeObjectByTag(struct, value, JsonTag, options)
}

export function decodeJson(struct: SchemaLike<unknown, unknown, boolean>, value: unknown, options: JsonCodecOptions = {}): unknown {
  return decodeObjectByTag(struct, value, JsonTag, options)
}

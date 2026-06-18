import type { RequestBuildValue } from '../../internal/request_values'
import { encodeStructValue, getStructFields, isObjectStruct } from '../introspection'
import type { TagNamespace } from '../tag'
import { HeaderTag, QueryTag, UriTag } from '../tag'
import type { SchemaLike } from '../types'
import { assertPlainObject, getWireKey } from './common'
import { isSearchParamScalar } from './urlencoded'

export interface QueryCodecOptions {
  allowComplex?: boolean
}

export function encodeQueryParams(
  struct: SchemaLike<unknown, unknown, boolean>,
  value: unknown,
  options: QueryCodecOptions = {},
): { [key: string]: RequestBuildValue } {
  return encodeTaggedRecord(struct, value, QueryTag, 'query', options)
}

export function encodePathParams(struct: SchemaLike<unknown, unknown, boolean>, value: unknown): { [key: string]: RequestBuildValue } {
  return encodeTaggedRecord(struct, value, UriTag, 'uri', { scalarOnly: true })
}

export function encodeHeaders(struct: SchemaLike<unknown, unknown, boolean>, value: unknown): { [key: string]: RequestBuildValue } {
  return encodeTaggedRecord(struct, value, HeaderTag, 'header')
}

function encodeTaggedRecord(
  struct: SchemaLike<unknown, unknown, boolean>,
  value: unknown,
  namespace: TagNamespace,
  label: string,
  options: QueryCodecOptions & { scalarOnly?: boolean } = {},
): { [key: string]: RequestBuildValue } {
  if (!isObjectStruct(struct)) {
    throw new TypeError(`${label} encode expects object struct`)
  }

  assertPlainObject(value, `${label} encode expects object value`)

  const record: { [key: string]: RequestBuildValue } = Object.create(null)
  for (const field of getStructFields(struct)) {
    const fieldTag = field.tags.get(namespace.kind)
    const encoded = encodeStructValue(field.struct, value[field.key])
    if (typeof encoded === 'undefined') {
      continue
    }

    const key = getWireKey(field.key, fieldTag)
    record[key] = options.scalarOnly ? normalizeScalarRecordValue(label, key, encoded) : normalizeRecordValue(label, key, encoded, options)
  }

  return record
}

function normalizeRecordValue(label: string, key: string, value: unknown, options: QueryCodecOptions): RequestBuildValue {
  if (Array.isArray(value)) {
    return options.allowComplex ? value : value.map((item) => normalizeScalarRecordValue(label, key, item))
  }

  if (options.allowComplex && typeof value === 'object' && value !== null) {
    return value as unknown as { [key: string]: unknown }
  }

  return normalizeScalarRecordValue(label, key, value)
}

function normalizeScalarRecordValue(label: string, key: string, value: unknown): boolean | null | number | string {
  if (isSearchParamScalar(value)) {
    return value
  }

  throw new TypeError(getUnsupportedRecordValueMessage(label, key))
}

function getUnsupportedRecordValueMessage(label: string, key: string): string {
  if (label === 'query') {
    return `query value for "${key}" requires queryParamsSerializer or a scalar value`
  }

  return `${label} value for "${key}" requires a scalar value`
}

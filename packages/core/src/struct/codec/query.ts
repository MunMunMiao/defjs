import type { RequestBuildValue } from '../../internal/request_values'
import { encodeStructValue, getStructFields, isObjectStruct } from '../introspection'
import { HeaderTag, QueryTag, type TagNamespace, UriTag } from '../tag'
import type { SchemaLike } from '../types'
import { assertPlainObject, getWireKey } from './common'
import { isSearchParamScalar } from './urlencoded'

type ScalarRequestBuildValue = boolean | null | number | string

export interface QueryCodecOptions {
  allowComplex?: boolean
}

export function encodeQueryParams(
  struct: SchemaLike<any, any, boolean>,
  value: unknown,
  options: QueryCodecOptions = {},
): Record<string, RequestBuildValue> {
  return encodeTaggedRecord(struct, value, QueryTag, 'query', options)
}

export function encodePathParams(struct: SchemaLike<any, any, boolean>, value: unknown): Record<string, RequestBuildValue> {
  return encodeTaggedRecord(struct, value, UriTag, 'uri', { scalarOnly: true })
}

export function encodeHeaders(struct: SchemaLike<any, any, boolean>, value: unknown): Record<string, RequestBuildValue> {
  return encodeTaggedRecord(struct, value, HeaderTag, 'header')
}

function encodeTaggedRecord(
  struct: SchemaLike<any, any, boolean>,
  value: unknown,
  namespace: TagNamespace,
  label: string,
  options: QueryCodecOptions & { scalarOnly?: boolean } = {},
): Record<string, RequestBuildValue> {
  if (!isObjectStruct(struct)) {
    throw new TypeError(`${label} encode expects object struct`)
  }

  assertPlainObject(value, `${label} encode expects object value`)

  const record: Record<string, RequestBuildValue> = Object.create(null)
  for (const field of getStructFields(struct)) {
    const fieldTag = field.tags.get(namespace.kind)
    if (!fieldTag) {
      continue
    }

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
    return options.allowComplex ? value : value.map(item => normalizeScalarRecordValue(label, key, item))
  }

  if (options.allowComplex && typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>
  }

  return normalizeScalarRecordValue(label, key, value)
}

function normalizeScalarRecordValue(label: string, key: string, value: unknown): ScalarRequestBuildValue {
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

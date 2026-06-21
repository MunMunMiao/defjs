import type { RequestBuildValue } from '../../internal/request_values'
import type { AnyStructLike } from '../types'
import { encodeFlatByAlias } from './flat'
import { isSearchParamScalar } from './urlencoded'

export interface QueryCodecOptions {
  allowComplex?: boolean
}

export function encodeQueryParams(
  struct: AnyStructLike,
  value: unknown,
  options: QueryCodecOptions = {},
): { [key: string]: RequestBuildValue } {
  return encodeFlatRecord(struct, value, 'query', options)
}

export function encodePathParams(struct: AnyStructLike, value: unknown): { [key: string]: RequestBuildValue } {
  return encodeFlatRecord(struct, value, 'uri', { scalarOnly: true })
}

export function encodeHeaders(struct: AnyStructLike, value: unknown): { [key: string]: RequestBuildValue } {
  return encodeFlatRecord(struct, value, 'header')
}

function encodeFlatRecord(
  struct: AnyStructLike,
  value: unknown,
  label: string,
  options: QueryCodecOptions & { scalarOnly?: boolean } = {},
): { [key: string]: RequestBuildValue } {
  return encodeFlatByAlias(struct, value, {
    create: () => Object.create(null) as { [key: string]: RequestBuildValue },
    label,
    put: (record, key, encoded) => {
      record[key] = options.scalarOnly
        ? normalizeScalarRecordValue(label, key, encoded)
        : normalizeRecordValue(label, key, encoded, options)
    },
  })
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

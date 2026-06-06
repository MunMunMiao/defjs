import { encodeStructValue, getStructFields, isObjectStruct } from '../introspection'
import { MultipartTag } from '../tag'
import type { SchemaLike } from '../types'
import { assertPlainObject, getWireKey } from './common'
import { isSearchParamScalar, stringifySearchParamScalar } from './urlencoded'

export function encodeMultipart(struct: SchemaLike<any, any, boolean>, value: unknown): FormData {
  if (!isObjectStruct(struct)) {
    throw new TypeError('multipart encode expects object struct')
  }

  /* istanbul ignore next -- unreachable: FormData is available in all target runtimes */
  if (typeof FormData === 'undefined') {
    throw new Error('FormData is not supported in current runtime')
  }

  assertPlainObject(value, 'multipart encode expects object value')

  const form = new FormData()
  for (const field of getStructFields(struct)) {
    const fieldTag = field.tags.get(MultipartTag.kind)
    appendFormData(form, getWireKey(field.key, fieldTag), encodeStructValue(field.struct, value[field.key]))
  }

  return form
}

export function appendFormData(form: FormData, key: string, value: unknown): void {
  if (typeof value === 'undefined') {
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendFormData(form, key, item)
    }
    return
  }

  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    form.append(key, value)
    return
  }

  if (isSearchParamScalar(value)) {
    form.append(key, stringifySearchParamScalar(value))
    return
  }

  throw new TypeError(`multipart value for "${key}" requires a scalar, Blob, or File`)
}

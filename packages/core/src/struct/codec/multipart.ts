import { isObjectStruct } from '../introspection'
import type { AnyStructLike } from '../types'
import { encodeFlatByAlias, writeRepeated } from './flat'
import { isSearchParamScalar, stringifySearchParamScalar } from './urlencoded'

export function encodeMultipart(struct: AnyStructLike, value: unknown): FormData {
  if (!isObjectStruct(struct)) {
    throw new TypeError('multipart encode expects object struct')
  }

  /* istanbul ignore next -- unreachable: FormData is available in all target runtimes */
  if (typeof FormData === 'undefined') {
    throw new Error('FormData is not supported in current runtime')
  }

  return encodeFlatByAlias(struct, value, {
    create: () => new FormData(),
    label: 'multipart',
    put: appendFormData,
  })
}

export function appendFormData(form: FormData, key: string, value: unknown): void {
  writeRepeated(key, value, (itemKey, item) => {
    if (typeof Blob !== 'undefined' && item instanceof Blob) {
      form.append(itemKey, item)
      return
    }

    if (isSearchParamScalar(item)) {
      form.append(itemKey, stringifySearchParamScalar(item))
      return
    }

    throw new TypeError(`multipart value for "${itemKey}" requires a scalar, Blob, or File`)
  })
}

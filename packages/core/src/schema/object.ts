import { type BaseMetadata, type Schema, _metadata, createSchema, } from './schema'
import { type FlattenObject, type Infer, isObject } from './util'

export type ExtractObjectValue<T, K extends keyof T> = T[K] extends () => Schema
  ? Infer<ReturnType<T[K]>>
  : T[K] extends Schema
    ? Infer<T[K]>
    : T[K] extends { [key: string]: Schema }
      ? ObjectOutput<T[K]>
      : never

export type ObjectOutput<T> = FlattenObject<
  {
    [K in keyof T as T[K] extends Schema<infer O> ? (undefined extends O ? K : never) : never]?: ExtractObjectValue<T, K>
  } & {
    [K in keyof T as T[K] extends Schema<infer O> ? (undefined extends O ? never : K) : K]: ExtractObjectValue<T, K>
  }
>

export type UnionObjectSchema<T extends any[]> = T extends [infer F, ...infer R]
  ? F extends ObjectSchema<infer O>
    ? O & UnionObjectSchema<R>
    : never
  : {}

export interface ObjectMetadata<T> extends BaseMetadata<ObjectOutput<T>> {
  kind: 'object'
  shape: T
}

export interface ObjectSchema<T> extends Schema {
  readonly [_metadata]: ObjectMetadata<T>
  extend<S extends ObjectSchema<any>[]>(...args: S): ObjectSchema<T & UnionObjectSchema<S>>
}

export function _object<T>(shape: T): ObjectSchema<T> {
  if (!isObject(shape)) {
    throw new Error('shape must be an object')
  }

  const md = {
    kind: 'object',
    shape,
    default: Object(),
  } as ObjectMetadata<T>
  const s = createSchema(md) as ObjectSchema<T>

  s.extend = <S extends ObjectSchema<any>[]>(...args: S) => {
    let newShape = { ...md.shape }
    for (const arg of args) {
      newShape = { ...newShape, ...arg }
    }
    return _object(newShape) as ObjectSchema<T & UnionObjectSchema<S>>
  }

  return s
}

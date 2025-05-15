import type { Schema, _metadata } from './schema'

export function isObject(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && value.constructor === Object
}

export function isArray(value: unknown): value is any[] {
  return Array.isArray(value)
}

export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value)
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

export function isNull(value: unknown): value is null {
  return typeof value === 'object' && value === null
}

export function isUndefined(value: unknown): value is undefined {
  return typeof value === 'undefined'
}

export function isSymbol(value: unknown): value is symbol {
  return typeof value === 'symbol'
}

export function isFile(value: unknown): value is File {
  return value instanceof File
}

export function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer
}

export function isBlob(value: unknown): value is Blob {
  return value instanceof Blob
}

export type FlattenObject<T> = {
  [K in keyof T]: T[K]
}

export type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

export type Infer<T> = T extends Schema ? T[typeof _metadata]['output'] : never

export declare function checkType<T>(): <U extends T>() => void

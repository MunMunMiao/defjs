import { DEFINITION } from './symbols'
import type { ParseFailure, ParseSuccess, Path, RuntimeSchema, SchemaDefinition, SchemaIssue } from './types'

export function success<T>(value: T): ParseSuccess<T> {
  return {
    ok: true,
    value,
  }
}

export function failure(...issues: SchemaIssue[]): ParseFailure {
  return {
    issues,
    ok: false,
  }
}

export function expectedType(definition: SchemaDefinition): string {
  switch (definition.kind) {
    case 'any':
      return 'any'

    case 'array':
      return `array<${expectedType((definition.item as RuntimeSchema)[DEFINITION])}>`

    case 'arrayBuffer':
      return 'ArrayBuffer'

    case 'blob':
      return 'Blob'

    case 'bigint':
    case 'boolean':
    case 'date':
    case 'file':
    case 'null':
    case 'number':
    case 'string':
      return definition.expected

    case 'enum':
    case 'literal':
      return definition.expected

    case 'intersection':
      return `${expectedType((definition.left as RuntimeSchema)[DEFINITION])} & ${expectedType((definition.right as RuntimeSchema)[DEFINITION])}`

    case 'object':
      return 'object'

    case 'or':
      return definition.options.map(option => expectedType((option as RuntimeSchema)[DEFINITION])).join(' | ')

    case 'discriminatedUnion':
      return definition.expected

    case 'record':
      return `record<${expectedType((definition.value as RuntimeSchema)[DEFINITION])}>`

    case 'tuple':
      return 'tuple'

    case 'unknown':
      return 'unknown'
  }
}

export function formatPath(path: Path): string {
  if (path.length === 0) {
    return '<root>'
  }

  let output = ''
  for (const item of path) {
    if (typeof item === 'number') {
      output += `[${item}]`
      continue
    }

    output += output ? `.${item}` : item
  }
  return output
}

export function hasOwnKey(value: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(value, key)
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function cloneValue<T>(value: T): T {
  if (value === null || value === undefined) {
    return value
  }

  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }

  if (Array.isArray(value)) {
    return value.map(item => cloneValue(item)) as T
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T
  }

  if (value instanceof ArrayBuffer) {
    return value.slice(0) as T
  }

  if (isPlainObject(value)) {
    const output: Record<string, unknown> = Object.create(null)
    for (const [key, item] of Object.entries(value)) {
      output[key] = cloneValue(item)
    }
    return output as T
  }

  return value
}

export function describeValue(value: unknown): string {
  if (value === null) {
    return 'null'
  }

  if (value === undefined) {
    return 'undefined'
  }

  if (typeof value === 'string') {
    return JSON.stringify(value)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (value instanceof File) {
    return `File(${value.name})`
  }

  if (value instanceof Blob) {
    return `Blob(${value.type || 'application/octet-stream'})`
  }

  if (value instanceof ArrayBuffer) {
    return `ArrayBuffer(${value.byteLength})`
  }

  if (Array.isArray(value)) {
    return 'array'
  }

  if (isPlainObject(value)) {
    return 'object'
  }

  return Object.prototype.toString.call(value)
}

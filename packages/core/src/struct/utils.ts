import { DEFINITION } from './symbols'
import type { EnumDefinition, ParseFailure, ParseSuccess, Path, RuntimeStruct, StructDefinition, StructIssue } from './types'

export function matchesEnum(definition: EnumDefinition<string | number>, value: unknown): boolean {
  // One-shot schemas avoid allocating a Set. A second lookup pays for the reusable index.
  if (definition.valueSet === undefined) {
    definition.valueSet = null
    return definition.values.includes(value as string | number)
  }
  return (definition.valueSet ??= new Set(definition.values)).has(value as string | number)
}

export function success<T>(value: T): ParseSuccess<T> {
  return {
    ok: true,
    value,
  }
}

export function failure(issue: StructIssue): ParseFailure {
  return {
    issue,
    ok: false,
  }
}

export function expectedType(definition: StructDefinition): string {
  switch (definition.kind) {
    case 'any':
      return 'any'

    case 'array':
      return `array<${expectedType((definition.item as RuntimeStruct)[DEFINITION])}>`

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
    case 'or':
    case 'discriminatedUnion':
      return definition.expected

    case 'object':
      return 'object'

    case 'record':
      return `record<${expectedType((definition.value as RuntimeStruct)[DEFINITION])}>`

    case 'request':
      return 'request'

    case 'requestBody':
      return `${definition.codec} body`

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

export function hasOwnKey(value: { [key: string]: unknown }, key: string): boolean {
  return Object.hasOwn(value, key)
}

export function isPlainObject(value: unknown): value is { [key: string]: unknown } {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
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

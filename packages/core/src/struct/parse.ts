import { issue } from './errors'
import { resolveObjectShape } from './shape'
import { DEFINITION, OMIT } from './symbols'
import type {
  ArrayDefinition,
  DiscriminatedUnionDefinition,
  EnumDefinition,
  IntersectionDefinition,
  LiteralDefinition,
  LiteralValue,
  ObjectDefinition,
  ParseMode,
  ParseResult,
  Path,
  PrimitiveDefinition,
  PrimitiveKind,
  RecordDefinition,
  RequestBodyDefinition,
  RequestDefinition,
  RuntimeSchema,
  SchemaDefinition,
  SchemaIssue,
  TupleDefinition,
  UnionDefinition,
} from './types'
import { cloneValue, expectedType, failure, hasOwnKey, isPlainObject, success } from './utils'

export function parseValue(schema: RuntimeSchema, input: unknown, path: Path, mode: ParseMode): ParseResult<unknown> {
  const definition = schema[DEFINITION]

  if (input === undefined) {
    return parseMissingValue(schema, path, mode)
  }

  if (input === null) {
    if (definition.kind === 'null' || definition.flags.nullable) {
      return success(null)
    }
    return parseMissingValue(schema, path, mode)
  }

  switch (definition.kind) {
    case 'any':
    case 'unknown':
      return success(input)

    case 'array':
      return parseArrayValue(definition, input, path)

    case 'arrayBuffer':
    case 'bigint':
    case 'blob':
    case 'boolean':
    case 'date':
    case 'file':
    case 'null':
    case 'number':
    case 'string':
      return parsePrimitiveValue(definition, input, path)

    case 'enum':
      return parseEnumValue(definition, input, path)

    case 'intersection':
      return parseIntersectionValue(definition, input, path)

    case 'literal':
      return parseLiteralValue(definition, input, path)

    case 'object':
      return parseObjectValue(schema, definition, input, path)

    case 'or':
      return parseUnionValue(definition, input, path)

    case 'discriminatedUnion':
      return parseDiscriminatedUnionValue(definition, input, path)

    case 'record':
      return parseRecordValue(definition, input, path)

    case 'request':
      return parseRequestValue(definition, input, path)

    case 'requestBody':
      return parseRequestBodyValue(definition, input, path, mode)

    case 'tuple':
      return parseTupleValue(definition, input, path)
  }
}

function parseMissingValue(schema: RuntimeSchema, path: Path, mode: ParseMode): ParseResult<unknown> {
  const definition = schema[DEFINITION]

  if (mode === 'field' && definition.flags.optional) {
    return success(OMIT)
  }

  if (definition.flags.optional) {
    return success(undefined)
  }

  if (definition.flags.nullable || definition.kind === 'null') {
    return success(null)
  }

  return success(buildZeroValue(schema, path))
}

function parsePrimitiveValue(
  definition: PrimitiveDefinition<PrimitiveKind, unknown, unknown>,
  input: unknown,
  path: Path,
): ParseResult<unknown> {
  if (!definition.is(input)) {
    return failure(issue(path, 'invalid_type', definition.expected, input))
  }

  return definition.decode ? definition.decode(input, path) : success(input)
}

function parseEnumValue(definition: EnumDefinition<number | string>, input: unknown, path: Path): ParseResult<unknown> {
  return definition.values.includes(input as number | string)
    ? success(input)
    : failure(issue(path, 'invalid_enum', definition.expected, input))
}

function parseLiteralValue(definition: LiteralDefinition<LiteralValue>, input: unknown, path: Path): ParseResult<unknown> {
  return Object.is(input, definition.value) ? success(input) : failure(issue(path, 'invalid_literal', definition.expected, input))
}

function parseArrayValue(definition: ArrayDefinition, input: unknown, path: Path): ParseResult<unknown[]> {
  if (!Array.isArray(input)) {
    return failure(issue(path, 'invalid_type', 'array', input))
  }

  const output: unknown[] = []
  const issues: SchemaIssue[] = []

  for (let index = 0; index < input.length; index += 1) {
    const result = parseValue(definition.item as unknown as RuntimeSchema, input[index], [...path, index], 'value')
    if (result.ok) {
      output[index] = result.value
    } else {
      issues.push(...result.issues)
    }
  }

  return issues.length > 0 ? failure(...issues) : success(output)
}

function parseObjectValue(
  schema: RuntimeSchema,
  definition: ObjectDefinition,
  input: unknown,
  path: Path,
): ParseResult<Record<string, unknown>> {
  if (!isPlainObject(input)) {
    return failure(issue(path, 'invalid_type', 'object', input))
  }

  const shape = resolveObjectShape(schema, definition)
  const output: Record<string, unknown> = Object.create(null)
  const issues: SchemaIssue[] = []

  for (const [key, itemSchema] of Object.entries(shape)) {
    const hasOwnInput = hasOwnKey(input, key)
    const result = parseValue(itemSchema as unknown as RuntimeSchema, hasOwnInput ? input[key] : undefined, [...path, key], 'field')

    if (result.ok) {
      if (result.value !== OMIT) {
        output[key] = result.value
      }
    } else {
      issues.push(...result.issues)
    }
  }

  return issues.length > 0 ? failure(...issues) : success(output)
}

export function isFieldRequired(itemDefinition: SchemaDefinition): boolean {
  return !itemDefinition.flags.optional && !itemDefinition.flags.nullable
}

function parseRecordValue(definition: RecordDefinition, input: unknown, path: Path): ParseResult<Record<string, unknown>> {
  if (!isPlainObject(input)) {
    return failure(issue(path, 'invalid_type', 'record', input))
  }

  const output: Record<string, unknown> = Object.create(null)
  const issues: SchemaIssue[] = []

  for (const [key, value] of Object.entries(input)) {
    const result = parseValue(definition.value as unknown as RuntimeSchema, value, [...path, key], 'field')
    if (result.ok) {
      if (result.value !== OMIT) {
        output[key] = result.value
      }
    } else {
      issues.push(...result.issues)
    }
  }

  return issues.length > 0 ? failure(...issues) : success(output)
}

function parseRequestValue(definition: RequestDefinition, input: unknown, path: Path): ParseResult<Record<string, unknown>> {
  if (!isPlainObject(input)) {
    return failure(issue(path, 'invalid_type', 'object', input))
  }

  const output: Record<string, unknown> = Object.create(null)
  const issues: SchemaIssue[] = []
  const sections = getRequestSections(definition)

  for (const [key, sectionSchema] of sections) {
    const sectionKey = key as string
    const result = parseValue(sectionSchema, hasOwnKey(input, sectionKey) ? input[sectionKey] : undefined, [...path, sectionKey], 'field')
    if (result.ok) {
      if (result.value !== OMIT) {
        output[sectionKey] = result.value
      }
    } else {
      issues.push(...result.issues)
    }
  }

  return issues.length > 0 ? failure(...issues) : success(output)
}

function parseRequestBodyValue(definition: RequestBodyDefinition, input: unknown, path: Path, mode: ParseMode): ParseResult<unknown> {
  return parseValue(definition.schema as unknown as RuntimeSchema, input, path, mode)
}

function parseTupleValue(definition: TupleDefinition, input: unknown, path: Path): ParseResult<unknown[]> {
  if (!Array.isArray(input)) {
    return failure(issue(path, 'invalid_type', 'tuple', input))
  }

  const output: unknown[] = []
  const issues: SchemaIssue[] = []

  for (let index = 0; index < definition.items.length; index += 1) {
    const result = parseValue(definition.items[index] as unknown as RuntimeSchema, input[index], [...path, index], 'value')
    if (result.ok) {
      output[index] = result.value
    } else {
      issues.push(...result.issues)
    }
  }

  return issues.length > 0 ? failure(...issues) : success(output)
}

function parseUnionValue(definition: UnionDefinition, input: unknown, path: Path): ParseResult<unknown> {
  for (const option of definition.options) {
    const result = parseValue(option as unknown as RuntimeSchema, input, path, 'value')
    if (result.ok) {
      return result
    }
  }

  return failure(issue(path, 'invalid_union', expectedType(definition), input))
}

function parseDiscriminatedUnionValue(definition: DiscriminatedUnionDefinition, input: unknown, path: Path): ParseResult<unknown> {
  if (!isPlainObject(input)) {
    return failure(issue(path, 'invalid_type', 'object', input))
  }

  const value = input[definition.discriminator]
  const target = definition.map.get(value)
  if (!target) {
    return failure(issue([...path, definition.discriminator], 'invalid_union', definition.expected, value))
  }

  return parseValue(target as unknown as RuntimeSchema, input, path, 'value')
}

function parseIntersectionValue(definition: IntersectionDefinition, input: unknown, path: Path): ParseResult<unknown> {
  const leftResult = parseValue(definition.left as unknown as RuntimeSchema, input, path, 'value')
  if (!leftResult.ok) {
    return leftResult
  }

  const rightResult = parseValue(definition.right as unknown as RuntimeSchema, input, path, 'value')
  if (!rightResult.ok) {
    return rightResult
  }

  const merged =
    isPlainObject(leftResult.value) && isPlainObject(rightResult.value) ? { ...leftResult.value, ...rightResult.value } : rightResult.value

  return success(merged)
}

export function safeZeroValue(schema: RuntimeSchema): unknown {
  return buildMissingValue(schema, [], 'value')
}

export function buildZeroValue(schema: RuntimeSchema, path: Path): unknown {
  const definition = schema[DEFINITION]

  switch (definition.kind) {
    case 'any':
    case 'unknown':
      return undefined

    case 'array':
      return []

    case 'arrayBuffer':
    case 'bigint':
    case 'blob':
    case 'boolean':
    case 'date':
    case 'file':
    case 'null':
    case 'number':
    case 'string':
      return definition.zero()

    case 'enum':
      return cloneValue(definition.values[0])

    case 'intersection':
      return buildMissingValue(definition.right as unknown as RuntimeSchema, path, 'value')

    case 'literal':
      return cloneValue(definition.value)

    case 'object': {
      const output: Record<string, unknown> = Object.create(null)
      const shape = resolveObjectShape(schema, definition)

      for (const [key, itemSchema] of Object.entries(shape)) {
        const value = buildMissingValue(itemSchema as unknown as RuntimeSchema, [...path, key], 'field')
        if (value !== OMIT) {
          output[key] = value
        }
      }

      return output
    }

    case 'or':
      return buildMissingValue(definition.options[0] as unknown as RuntimeSchema, path, 'value')

    case 'discriminatedUnion':
      return buildMissingValue(definition.options[0] as unknown as RuntimeSchema, path, 'value')

    case 'record':
      return {}

    case 'request': {
      const output: Record<string, unknown> = Object.create(null)
      for (const [key, sectionSchema] of getRequestSections(definition)) {
        const value = buildMissingValue(sectionSchema, [...path, key], 'field')
        if (value !== OMIT) {
          output[key] = value
        }
      }
      return output
    }

    case 'requestBody':
      return buildMissingValue(definition.schema as unknown as RuntimeSchema, path, 'value')

    case 'tuple': {
      const output: unknown[] = []
      for (let index = 0; index < definition.items.length; index += 1) {
        output[index] = buildMissingValue(definition.items[index] as unknown as RuntimeSchema, [...path, index], 'value')
      }
      return output
    }
  }
}

function buildMissingValue(schema: RuntimeSchema, path: Path, mode: ParseMode): unknown {
  const definition = schema[DEFINITION]

  if (mode === 'field' && definition.flags.optional) {
    return OMIT
  }

  if (definition.flags.optional) {
    return undefined
  }

  if (definition.flags.nullable || definition.kind === 'null') {
    return null
  }

  return buildZeroValue(schema, path)
}

function getRequestSections(
  definition: RequestDefinition,
): [keyof Pick<RequestDefinition, 'body' | 'headers' | 'path' | 'query'>, RuntimeSchema][] {
  const sections: [keyof Pick<RequestDefinition, 'body' | 'headers' | 'path' | 'query'>, RuntimeSchema][] = []
  if (definition.path) {
    sections.push(['path', definition.path as unknown as RuntimeSchema])
  }
  if (definition.query) {
    sections.push(['query', definition.query as unknown as RuntimeSchema])
  }
  if (definition.headers) {
    sections.push(['headers', definition.headers as unknown as RuntimeSchema])
  }
  if (definition.body) {
    sections.push(['body', definition.body as unknown as RuntimeSchema])
  }
  return sections
}

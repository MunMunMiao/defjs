import { issue } from './errors'
import { resolveObjectShape } from './shape'
import { DEFINITION, OMIT } from './symbols'
import type {
  ArrayDefinition,
  DiscriminatedUnionDefinition,
  EnumDefinition,
  IntersectionDefinition,
  LiteralDefinition,
  ObjectDefinition,
  ParseMode,
  ParseOptions,
  ParseResult,
  Path,
  PrimitiveDefinition,
  PrimitiveKind,
  RecordDefinition,
  RuntimeSchema,
  SchemaDefinition,
  SchemaIssue,
  TupleDefinition,
  UnionDefinition,
} from './types'
import { cloneValue, expectedType, failure, hasOwnKey, isPlainObject, success } from './utils'

export function parseValue(
  schema: RuntimeSchema,
  input: unknown,
  path: Path,
  mode: ParseMode,
  options: ParseOptions = {},
): ParseResult<unknown> {
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
      return parseArrayValue(definition, input, path, options)

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
      return parseIntersectionValue(definition, input, path, options)

    case 'literal':
      return parseLiteralValue(definition, input, path)

    case 'object':
      return parseObjectValue(schema, definition, input, path, options)

    case 'or':
      return parseUnionValue(definition, input, path, options)

    case 'discriminatedUnion':
      return parseDiscriminatedUnionValue(definition, input, path, options)

    case 'record':
      return parseRecordValue(definition, input, path, options)

    case 'tuple':
      return parseTupleValue(definition, input, path, options)
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

function parsePrimitiveValue(definition: PrimitiveDefinition<PrimitiveKind, any, any>, input: unknown, path: Path): ParseResult<unknown> {
  if (!definition.is(input)) {
    return failure(issue(path, 'invalid_type', definition.expected, input))
  }

  return definition.decode ? definition.decode(input, path) : success(input)
}

function parseEnumValue(definition: EnumDefinition<any>, input: unknown, path: Path): ParseResult<unknown> {
  return definition.values.includes(input) ? success(input) : failure(issue(path, 'invalid_enum', definition.expected, input))
}

function parseLiteralValue(definition: LiteralDefinition<any>, input: unknown, path: Path): ParseResult<unknown> {
  return Object.is(input, definition.value) ? success(input) : failure(issue(path, 'invalid_literal', definition.expected, input))
}

function parseArrayValue(definition: ArrayDefinition, input: unknown, path: Path, options: ParseOptions): ParseResult<unknown[]> {
  if (!Array.isArray(input)) {
    return failure(issue(path, 'invalid_type', 'array', input))
  }

  const output: unknown[] = []
  const issues: SchemaIssue[] = []

  for (let index = 0; index < input.length; index += 1) {
    const result = parseValue(definition.item as RuntimeSchema, input[index], [...path, index], 'value', options)
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
  options: ParseOptions,
): ParseResult<Record<string, unknown>> {
  if (!isPlainObject(input)) {
    return failure(issue(path, 'invalid_type', 'object', input))
  }

  const shape = resolveObjectShape(schema, definition)
  const output: Record<string, unknown> = Object.create(null)
  const issues: SchemaIssue[] = []
  const declared = new Set<string>()

  for (const [key, itemSchema] of Object.entries(shape)) {
    declared.add(key)
    const hasOwnInput = hasOwnKey(input, key)
    const result = parseValue(itemSchema as RuntimeSchema, hasOwnInput ? input[key] : undefined, [...path, key], 'field', options)

    if (result.ok) {
      if (result.value !== OMIT) {
        output[key] = result.value
      }
    } else {
      issues.push(...result.issues)
    }
  }

  if (options.unknownFields === 'error') {
    for (const inputKey of Object.keys(input)) {
      if (!declared.has(inputKey)) {
        issues.push(issue([...path, inputKey], 'unrecognized_keys', 'declared field', input[inputKey], `Unrecognized key "${inputKey}"`))
      }
    }
  }

  return issues.length > 0 ? failure(...issues) : success(output)
}

export function isFieldRequired(itemDefinition: SchemaDefinition): boolean {
  return !itemDefinition.flags.optional && !itemDefinition.flags.nullable
}

function parseRecordValue(
  definition: RecordDefinition,
  input: unknown,
  path: Path,
  options: ParseOptions,
): ParseResult<Record<string, unknown>> {
  if (!isPlainObject(input)) {
    return failure(issue(path, 'invalid_type', 'record', input))
  }

  const output: Record<string, unknown> = Object.create(null)
  const issues: SchemaIssue[] = []

  for (const [key, value] of Object.entries(input)) {
    const result = parseValue(definition.value as RuntimeSchema, value, [...path, key], 'field', options)
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

function parseTupleValue(definition: TupleDefinition, input: unknown, path: Path, options: ParseOptions): ParseResult<unknown[]> {
  if (!Array.isArray(input)) {
    return failure(issue(path, 'invalid_type', 'tuple', input))
  }

  const output: unknown[] = []
  const issues: SchemaIssue[] = []

  for (let index = 0; index < definition.items.length; index += 1) {
    const result = parseValue(definition.items[index] as RuntimeSchema, input[index], [...path, index], 'value', options)
    if (result.ok) {
      output[index] = result.value
    } else {
      issues.push(...result.issues)
    }
  }

  return issues.length > 0 ? failure(...issues) : success(output)
}

function parseUnionValue(definition: UnionDefinition, input: unknown, path: Path, options: ParseOptions): ParseResult<unknown> {
  for (const option of definition.options) {
    const result = parseValue(option as RuntimeSchema, input, path, 'value', options)
    if (result.ok) {
      return result
    }
  }

  return failure(issue(path, 'invalid_union', expectedType(definition), input))
}

function parseDiscriminatedUnionValue(
  definition: DiscriminatedUnionDefinition,
  input: unknown,
  path: Path,
  options: ParseOptions,
): ParseResult<unknown> {
  if (!isPlainObject(input)) {
    return failure(issue(path, 'invalid_type', 'object', input))
  }

  const value = input[definition.discriminator]
  const target = definition.map.get(value)
  if (!target) {
    return failure(issue([...path, definition.discriminator], 'invalid_union', definition.expected, value))
  }

  return parseValue(target as RuntimeSchema, input, path, 'value', options)
}

function parseIntersectionValue(
  definition: IntersectionDefinition,
  input: unknown,
  path: Path,
  options: ParseOptions,
): ParseResult<unknown> {
  const leftResult = parseValue(definition.left as RuntimeSchema, input, path, 'value', options)
  if (!leftResult.ok) {
    return leftResult
  }

  const rightResult = parseValue(definition.right as RuntimeSchema, input, path, 'value', options)
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
      return buildMissingValue(definition.right as RuntimeSchema, path, 'value')

    case 'literal':
      return cloneValue(definition.value)

    case 'object': {
      const output: Record<string, unknown> = Object.create(null)
      const shape = resolveObjectShape(schema, definition)

      for (const [key, itemSchema] of Object.entries(shape)) {
        const value = buildMissingValue(itemSchema as RuntimeSchema, [...path, key], 'field')
        if (value !== OMIT) {
          output[key] = value
        }
      }

      return output
    }

    case 'or':
      return buildMissingValue(definition.options[0] as RuntimeSchema, path, 'value')

    case 'discriminatedUnion':
      return buildMissingValue(definition.options[0] as RuntimeSchema, path, 'value')

    case 'record':
      return {}

    case 'tuple': {
      const output: unknown[] = []
      for (let index = 0; index < definition.items.length; index += 1) {
        output[index] = buildMissingValue(definition.items[index] as RuntimeSchema, [...path, index], 'value')
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

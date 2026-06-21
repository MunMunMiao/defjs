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
  RuntimeStruct,
  StructDefinition,
  StructIssue,
  TupleDefinition,
  UnionDefinition,
} from './types'
import { expectedType, failure, hasOwnKey, isPlainObject, success } from './utils'

export function parseValue(struct: RuntimeStruct, input: unknown, path: Path, mode: ParseMode): ParseResult<unknown> {
  const definition = struct[DEFINITION]

  if (input === undefined) {
    return parseMissingValue(struct, path, mode)
  }

  if (input === null) {
    if (definition.kind === 'null' || definition.flags.nullable) {
      return success(null)
    }
    return parseMissingValue(struct, path, mode)
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
      return parseObjectValue(struct, definition, input, path)

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

function parseMissingValue(struct: RuntimeStruct, path: Path, mode: ParseMode): ParseResult<unknown> {
  return success(resolveMissingValue(struct, path, mode))
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

function parseEnumValue(definition: EnumDefinition<string | number>, input: unknown, path: Path): ParseResult<unknown> {
  // Type boundary: enum structs are defined with string or number literals; by the time we reach this
  // parser the input has already been validated as non-null/undefined and only enum members can match.
  return definition.values.includes(input as string | number)
    ? success(input)
    : failure(issue(path, 'invalid_enum', definition.expected, input))
}

function parseLiteralValue(definition: LiteralDefinition<LiteralValue>, input: unknown, path: Path): ParseResult<unknown> {
  return Object.is(input, definition.value) ? success(input) : failure(issue(path, 'invalid_literal', definition.expected, input))
}

function finishParse<T>(issues: StructIssue[], output: T): ParseResult<T> {
  return issues.length > 0 ? failure(...issues) : success(output)
}

function parseArrayValue(definition: ArrayDefinition, input: unknown, path: Path): ParseResult<unknown[]> {
  if (!Array.isArray(input)) {
    return failure(issue(path, 'invalid_type', 'array', input))
  }

  const output: unknown[] = []
  const issues: StructIssue[] = []

  for (let index = 0; index < input.length; index += 1) {
    const result = parseValue(definition.item as RuntimeStruct, input[index], [...path, index], 'value')
    if (result.ok) {
      output[index] = result.value
    } else {
      issues.push(...result.issues)
    }
  }

  return finishParse(issues, output)
}

function parseObjectValue(
  struct: RuntimeStruct,
  definition: ObjectDefinition,
  input: unknown,
  path: Path,
): ParseResult<{ [key: string]: unknown }> {
  if (!isPlainObject(input)) {
    return failure(issue(path, 'invalid_type', 'object', input))
  }

  const shape = resolveObjectShape(struct, definition)
  const output: { [key: string]: unknown } = Object.create(null)
  const issues: StructIssue[] = []

  for (const [key, itemStruct] of Object.entries(shape)) {
    const hasOwnInput = hasOwnKey(input, key)
    const result = parseValue(itemStruct as RuntimeStruct, hasOwnInput ? input[key] : undefined, [...path, key], 'field')

    if (result.ok) {
      if (result.value !== OMIT) {
        output[key] = result.value
      }
    } else {
      issues.push(...result.issues)
    }
  }

  return finishParse(issues, output)
}

export function isFieldRequired(itemDefinition: StructDefinition): boolean {
  return !itemDefinition.flags.optional && !itemDefinition.flags.nullable
}

function parseRecordValue(definition: RecordDefinition, input: unknown, path: Path): ParseResult<{ [key: string]: unknown }> {
  if (!isPlainObject(input)) {
    return failure(issue(path, 'invalid_type', 'record', input))
  }

  const output: { [key: string]: unknown } = Object.create(null)
  const issues: StructIssue[] = []

  for (const [key, value] of Object.entries(input)) {
    const result = parseValue(definition.value as RuntimeStruct, value, [...path, key], 'field')
    if (result.ok) {
      if (result.value !== OMIT) {
        output[key] = result.value
      }
    } else {
      issues.push(...result.issues)
    }
  }

  return finishParse(issues, output)
}

function parseRequestValue(definition: RequestDefinition, input: unknown, path: Path): ParseResult<{ [key: string]: unknown }> {
  if (!isPlainObject(input)) {
    return failure(issue(path, 'invalid_type', 'object', input))
  }

  const output: { [key: string]: unknown } = Object.create(null)
  const issues: StructIssue[] = []
  const sections = definition.sections

  for (const section of sections) {
    const sectionKey = section.key
    const sectionStruct = section.struct
    const result = parseValue(sectionStruct, hasOwnKey(input, sectionKey) ? input[sectionKey] : undefined, [...path, sectionKey], 'field')
    if (result.ok) {
      if (result.value !== OMIT) {
        output[sectionKey] = result.value
      }
    } else {
      issues.push(...result.issues)
    }
  }

  return finishParse(issues, output)
}

function parseRequestBodyValue(definition: RequestBodyDefinition, input: unknown, path: Path, mode: ParseMode): ParseResult<unknown> {
  return parseValue(definition.struct as RuntimeStruct, input, path, mode)
}

function parseTupleValue(definition: TupleDefinition, input: unknown, path: Path): ParseResult<unknown[]> {
  if (!Array.isArray(input)) {
    return failure(issue(path, 'invalid_type', 'tuple', input))
  }

  const output: unknown[] = []
  const issues: StructIssue[] = []

  for (let index = 0; index < definition.items.length; index += 1) {
    const result = parseValue(definition.items[index] as RuntimeStruct, input[index], [...path, index], 'value')
    if (result.ok) {
      output[index] = result.value
    } else {
      issues.push(...result.issues)
    }
  }

  return finishParse(issues, output)
}

function parseUnionValue(definition: UnionDefinition, input: unknown, path: Path): ParseResult<unknown> {
  for (const option of definition.options) {
    const result = parseValue(option as RuntimeStruct, input, path, 'value')
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

  return parseValue(target as RuntimeStruct, input, path, 'value')
}

function parseIntersectionValue(definition: IntersectionDefinition, input: unknown, path: Path): ParseResult<unknown> {
  const leftResult = parseValue(definition.left as RuntimeStruct, input, path, 'value')
  if (!leftResult.ok) {
    return leftResult
  }

  const rightResult = parseValue(definition.right as RuntimeStruct, input, path, 'value')
  if (!rightResult.ok) {
    return rightResult
  }

  const merged =
    isPlainObject(leftResult.value) && isPlainObject(rightResult.value) ? { ...leftResult.value, ...rightResult.value } : rightResult.value

  return success(merged)
}

export function safeZeroValue(struct: RuntimeStruct): unknown {
  return resolveMissingValue(struct, [], 'value')
}

export function buildZeroValue(struct: RuntimeStruct, path: Path): unknown {
  const definition = struct[DEFINITION]

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
      return definition.values[0]

    case 'intersection': {
      const leftZero = buildZeroValue(definition.left as RuntimeStruct, path)
      const rightZero = buildZeroValue(definition.right as RuntimeStruct, path)
      return isPlainObject(leftZero) && isPlainObject(rightZero) ? { ...leftZero, ...rightZero } : rightZero
    }

    case 'literal':
      return definition.value

    case 'object': {
      const output: { [key: string]: unknown } = Object.create(null)
      const shape = resolveObjectShape(struct, definition)

      for (const [key, itemStruct] of Object.entries(shape)) {
        const value = resolveMissingValue(itemStruct as RuntimeStruct, [...path, key], 'field')
        if (value !== OMIT) {
          output[key] = value
        }
      }

      return output
    }

    case 'or':
      return resolveMissingValue(definition.options[0] as RuntimeStruct, path, 'value')

    case 'discriminatedUnion':
      return resolveMissingValue(definition.options[0] as RuntimeStruct, path, 'value')

    case 'record':
      return {}

    case 'request': {
      const output: { [key: string]: unknown } = Object.create(null)
      for (const section of definition.sections) {
        const key = section.key
        const sectionStruct = section.struct
        const value = resolveMissingValue(sectionStruct, [...path, key], 'field')
        if (value !== OMIT) {
          output[key] = value
        }
      }
      return output
    }

    case 'requestBody':
      return resolveMissingValue(definition.struct as RuntimeStruct, path, 'value')

    case 'tuple': {
      const output: unknown[] = []
      for (let index = 0; index < definition.items.length; index += 1) {
        output[index] = resolveMissingValue(definition.items[index] as RuntimeStruct, [...path, index], 'value')
      }
      return output
    }
  }
}

function resolveMissingValue(struct: RuntimeStruct, path: Path, mode: ParseMode): unknown {
  const definition = struct[DEFINITION]

  if (definition.flags.nullable || definition.kind === 'null') {
    return null
  }

  if (mode === 'field' && definition.flags.optional) {
    return OMIT
  }

  if (definition.flags.optional) {
    return undefined
  }

  return buildZeroValue(struct, path)
}

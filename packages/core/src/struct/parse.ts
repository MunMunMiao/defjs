import { issue } from './errors'
import { resolveStructFields } from './fields'
import { DEFINITION, OMIT } from './symbols'
import { REQUEST_SECTION_KEYS } from './types'
import type {
  ArrayDefinition,
  DiscriminatedUnionDefinition,
  EnumDefinition,
  InternalParseResult,
  IntersectionDefinition,
  LiteralDefinition,
  LiteralValue,
  ObjectDefinition,
  ParseMode,
  Path,
  PrimitiveDefinition,
  PrimitiveKind,
  RecordDefinition,
  RequestBodyDefinition,
  RequestDefinition,
  RuntimeStruct,
  TupleDefinition,
  UnionDefinition,
} from './types'
import { expectedType, failure, hasOwnKey, isObjectIntersectionStruct, isPlainObject, success } from './utils'

export function parseValue(
  struct: RuntimeStruct,
  input: unknown,
  path: Path,
  mode: ParseMode,
  useAliases = false,
): InternalParseResult<unknown> {
  const definition = struct[DEFINITION]

  if (input === undefined) {
    if (definition.flags.optional) {
      return success(mode === 'field' ? OMIT : undefined)
    }
    return failure(issue(path, mode === 'field' ? 'missing_key' : 'invalid_type', expectedType(definition), input))
  }

  if (input === null) {
    if (definition.kind === 'null' || definition.flags.nullable) {
      return success(null)
    }
    const delegatesNull =
      (definition.kind === 'literal' && definition.value === null) ||
      definition.kind === 'intersection' ||
      definition.kind === 'or' ||
      definition.kind === 'requestBody'
    if (!delegatesNull) {
      return failure(issue(path, 'invalid_type', expectedType(definition), input))
    }
  }

  switch (definition.kind) {
    case 'any':
    case 'unknown':
      return success(input)

    case 'array':
      return parseArrayValue(definition, input, path, useAliases)

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
      return parseIntersectionValue(definition, input, path, useAliases)

    case 'literal':
      return parseLiteralValue(definition, input, path)

    case 'object':
      return parseObjectValue(struct, definition, input, path, useAliases)

    case 'or':
      return parseUnionValue(definition, input, path, useAliases)

    case 'discriminatedUnion':
      return parseDiscriminatedUnionValue(definition, input, path, useAliases)

    case 'record':
      return parseRecordValue(definition, input, path, useAliases)

    case 'request':
      return parseRequestValue(definition, input, path, useAliases)

    case 'requestBody':
      return parseRequestBodyValue(definition, input, path, mode, useAliases)

    case 'tuple':
      return parseTupleValue(definition, input, path, useAliases)
  }
}

function parsePrimitiveValue(
  definition: PrimitiveDefinition<PrimitiveKind, unknown, unknown>,
  input: unknown,
  path: Path,
): InternalParseResult<unknown> {
  if (!definition.is(input)) {
    return failure(issue(path, 'invalid_type', definition.expected, input))
  }

  return definition.decode ? definition.decode(input, path) : success(input)
}

function parseEnumValue(definition: EnumDefinition<string | number>, input: unknown, path: Path): InternalParseResult<unknown> {
  // Type boundary: enum structs are defined with string or number literals; by the time we reach this
  // parser the input has already been validated as non-null/undefined and only enum members can match.
  return definition.values.includes(input as string | number)
    ? success(input)
    : failure(issue(path, 'invalid_enum', definition.expected, input))
}

function parseLiteralValue(definition: LiteralDefinition<LiteralValue>, input: unknown, path: Path): InternalParseResult<unknown> {
  return Object.is(input, definition.value) ? success(input) : failure(issue(path, 'invalid_literal', definition.expected, input))
}

function parseArrayValue(definition: ArrayDefinition, input: unknown, path: Path, useAliases: boolean): InternalParseResult<unknown[]> {
  if (!Array.isArray(input)) {
    return failure(issue(path, 'invalid_type', 'array', input))
  }

  const output: unknown[] = []
  for (let index = 0; index < input.length; index += 1) {
    const result = parseValue(definition.item as RuntimeStruct, input[index], [...path, index], 'value', useAliases)
    if (!result.ok) {
      return result
    }
    output.push(result.value)
  }
  return success(output)
}

function parseObjectValue(
  struct: RuntimeStruct,
  definition: ObjectDefinition,
  input: unknown,
  path: Path,
  useAliases: boolean,
  cachedField?: { inputKey: string; value: unknown },
): InternalParseResult<{ [key: string]: unknown }> {
  if (!isPlainObject(input)) {
    return failure(issue(path, 'invalid_type', 'object', input))
  }

  const output: { [key: string]: unknown } = Object.create(null)
  for (const field of resolveStructFields(struct, definition)) {
    const inputKey = useAliases ? field.wireKey : field.key
    const inputValue = cachedField?.inputKey === inputKey ? cachedField.value : hasOwnKey(input, inputKey) ? input[inputKey] : undefined
    const result = parseValue(field.struct, inputValue, [...path, field.key], 'field', useAliases)
    if (!result.ok) {
      return result
    }
    if (result.value !== OMIT) {
      output[field.key] = result.value
    }
  }
  return success(output)
}

function parseRecordValue(
  definition: RecordDefinition,
  input: unknown,
  path: Path,
  useAliases: boolean,
): InternalParseResult<{ [key: string]: unknown }> {
  if (!isPlainObject(input)) {
    return failure(issue(path, 'invalid_type', 'record', input))
  }

  const output: { [key: string]: unknown } = Object.create(null)
  for (const key of Object.keys(input)) {
    const result = parseValue(definition.value as RuntimeStruct, input[key], [...path, key], 'field', useAliases)
    if (!result.ok) {
      return result
    }
    if (result.value !== OMIT) {
      output[key] = result.value
    }
  }
  return success(output)
}

function parseRequestValue(
  definition: RequestDefinition,
  input: unknown,
  path: Path,
  useAliases: boolean,
): InternalParseResult<{ [key: string]: unknown }> {
  if (!isPlainObject(input)) {
    return failure(issue(path, 'invalid_type', 'object', input))
  }

  const output: { [key: string]: unknown } = Object.create(null)
  for (const sectionKey of REQUEST_SECTION_KEYS) {
    const sectionStruct = definition[sectionKey] as RuntimeStruct | undefined
    if (!sectionStruct) {
      continue
    }
    const sectionValue = hasOwnKey(input, sectionKey) ? input[sectionKey] : undefined
    if (sectionValue === undefined) {
      if (sectionStruct[DEFINITION].kind === 'object') {
        const emptyResult = parseValue(sectionStruct, {}, [...path, sectionKey], 'field', useAliases)
        if (emptyResult.ok) {
          output[sectionKey] = emptyResult.value
          continue
        }
      }
      return failure(issue([...path, sectionKey], 'missing_key', expectedType(sectionStruct[DEFINITION]), undefined))
    }

    const result = parseValue(sectionStruct, sectionValue, [...path, sectionKey], 'field', useAliases)
    if (!result.ok) {
      return result
    }
    output[sectionKey] = result.value
  }
  return success(output)
}

function parseRequestBodyValue(
  definition: RequestBodyDefinition,
  input: unknown,
  path: Path,
  mode: ParseMode,
  useAliases: boolean,
): InternalParseResult<unknown> {
  return parseValue(definition.struct as RuntimeStruct, input, path, mode, useAliases)
}

function parseTupleValue(definition: TupleDefinition, input: unknown, path: Path, useAliases: boolean): InternalParseResult<unknown[]> {
  if (!Array.isArray(input) || input.length !== definition.items.length) {
    return failure(issue(path, 'invalid_type', `tuple of length ${definition.items.length}`, input))
  }

  const output: unknown[] = []
  for (let index = 0; index < definition.items.length; index += 1) {
    const result = parseValue(definition.items[index] as RuntimeStruct, input[index], [...path, index], 'value', useAliases)
    if (!result.ok) {
      return result
    }
    output.push(result.value)
  }
  return success(output)
}

function parseUnionValue(definition: UnionDefinition, input: unknown, path: Path, useAliases: boolean): InternalParseResult<unknown> {
  for (const option of definition.options) {
    const result = parseValue(option as RuntimeStruct, input, path, 'value', useAliases)
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
  useAliases: boolean,
): InternalParseResult<unknown> {
  if (!isPlainObject(input)) {
    return failure(issue(path, 'invalid_type', 'object', input))
  }

  const discriminatorPath = [...path, definition.discriminator]
  if (!useAliases) {
    const value = hasOwnKey(input, definition.discriminator) ? input[definition.discriminator] : undefined
    if (value === undefined) {
      return failure(issue(discriminatorPath, 'missing_key', definition.expected, undefined))
    }
    const target = definition.map.get(value)
    if (!target) {
      return failure(issue(discriminatorPath, 'invalid_union', definition.expected, value))
    }
    const runtime = target as RuntimeStruct
    return parseObjectValue(runtime, runtime[DEFINITION] as ObjectDefinition, input, path, false, {
      inputKey: definition.discriminator,
      value,
    })
  }

  for (const option of definition.options) {
    const runtime = option as RuntimeStruct
    const optionDefinition = runtime[DEFINITION]
    if (optionDefinition.kind !== 'object') {
      continue
    }
    const discriminator = resolveStructFields(runtime, optionDefinition).find((field) => field.key === definition.discriminator)
    if (!discriminator || !hasOwnKey(input, discriminator.wireKey)) {
      continue
    }

    const value = input[discriminator.wireKey]
    if (value === undefined) {
      return failure(issue(discriminatorPath, 'missing_key', definition.expected, undefined))
    }
    const target = definition.map.get(value) as RuntimeStruct | undefined
    if (!target) {
      return failure(issue(discriminatorPath, 'invalid_union', definition.expected, value))
    }
    const targetDefinition = target[DEFINITION] as ObjectDefinition
    const targetDiscriminator = resolveStructFields(target, targetDefinition).find((field) => field.key === definition.discriminator)
    /* istanbul ignore if -- constructor invariant: every target has the declared discriminator field */
    if (!targetDiscriminator) {
      return failure(issue(discriminatorPath, 'invalid_union', definition.expected, value))
    }
    if (targetDiscriminator.wireKey !== discriminator.wireKey) {
      return failure(issue(discriminatorPath, 'invalid_union', definition.expected, value))
    }
    return parseObjectValue(target, targetDefinition, input, path, true, {
      inputKey: discriminator.wireKey,
      value,
    })
  }
  return failure(issue(discriminatorPath, 'missing_key', definition.expected, undefined))
}

function parseIntersectionValue(
  definition: IntersectionDefinition,
  input: unknown,
  path: Path,
  useAliases: boolean,
): InternalParseResult<unknown> {
  const leftResult = parseValue(definition.left as RuntimeStruct, input, path, 'value', useAliases)
  if (!leftResult.ok) {
    return leftResult
  }

  const rightResult = parseValue(definition.right as RuntimeStruct, input, path, 'value', useAliases)
  if (!rightResult.ok) {
    return rightResult
  }

  const shouldMerge =
    isPlainObject(leftResult.value) &&
    isPlainObject(rightResult.value) &&
    (!useAliases || (isObjectIntersectionStruct(definition.left) && isObjectIntersectionStruct(definition.right)))
  const merged = shouldMerge
    ? {
        ...(leftResult.value as { [key: string]: unknown }),
        ...(rightResult.value as { [key: string]: unknown }),
      }
    : rightResult.value
  return success(merged)
}

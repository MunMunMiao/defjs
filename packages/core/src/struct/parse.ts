import { hasErrorMap, issue } from './errors'
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
  ParseFailure,
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
import { expectedType, failure, hasOwnKey, isPlainObject, matchesEnum, success } from './utils'

// Failed union candidates are discarded. Public entry points always request detailed issues.
const QUIET_FAILURE: ParseFailure = {
  ok: false,
  issue: { code: 'invalid_union', expected: '', message: '', path: [], received: undefined },
}

export function parseValue(
  struct: RuntimeStruct,
  input: unknown,
  path: Path,
  mode: ParseMode,
  useAliases = false,
): InternalParseResult<unknown> {
  return parseValueAtPath(struct, input, [...path], mode, useAliases, true)
}

export function parseRootValue(struct: RuntimeStruct, input: unknown, mode: ParseMode, useAliases = false): InternalParseResult<unknown> {
  return parseValueAtPath(struct, input, [], mode, useAliases, true)
}

function parseValueAtPath(
  struct: RuntimeStruct,
  input: unknown,
  path: Path,
  mode: ParseMode,
  useAliases: boolean,
  reportIssues: boolean,
): InternalParseResult<unknown> {
  const definition = struct[DEFINITION]

  if (input === undefined) {
    if (definition.flags.optional) {
      return success(mode === 'field' ? OMIT : undefined)
    }
    return reportIssues
      ? failure(issue([...path], mode === 'field' ? 'missing_key' : 'invalid_type', expectedType(definition), input))
      : QUIET_FAILURE
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
      return reportIssues ? failure(issue([...path], 'invalid_type', expectedType(definition), input)) : QUIET_FAILURE
    }
  }

  switch (definition.kind) {
    case 'any':
    case 'unknown':
      return success(input)

    case 'array':
      return parseArrayValue(definition, input, path, useAliases, reportIssues)

    case 'arrayBuffer':
    case 'bigint':
    case 'blob':
    case 'boolean':
    case 'date':
    case 'file':
    case 'null':
    case 'number':
    case 'string':
      return parsePrimitiveValue(definition, input, path, reportIssues)

    case 'enum':
      return parseEnumValue(definition, input, path, reportIssues)

    case 'intersection':
      return parseIntersectionValue(definition, input, path, useAliases, reportIssues)

    case 'literal':
      return parseLiteralValue(definition, input, path, reportIssues)

    case 'object':
      return parseObjectValue(struct, definition, input, path, useAliases, reportIssues)

    case 'or':
      return parseUnionValue(definition, input, path, useAliases, reportIssues)

    case 'discriminatedUnion':
      return parseDiscriminatedUnionValue(definition, input, path, useAliases, reportIssues)

    case 'record':
      return parseRecordValue(definition, input, path, useAliases, reportIssues)

    case 'request':
      return parseRequestValue(definition, input, path, useAliases, reportIssues)

    case 'requestBody':
      return parseRequestBodyValue(definition, input, path, mode, useAliases, reportIssues)

    case 'tuple':
      return parseTupleValue(definition, input, path, useAliases, reportIssues)
  }
}

function parseChildValue(
  struct: RuntimeStruct,
  input: unknown,
  path: Path,
  segment: number | string,
  mode: ParseMode,
  useAliases: boolean,
  reportIssues: boolean,
): InternalParseResult<unknown> {
  path.push(segment)
  try {
    return parseValueAtPath(struct, input, path, mode, useAliases, reportIssues)
  } finally {
    path.pop()
  }
}

function parsePrimitiveValue(
  definition: PrimitiveDefinition<PrimitiveKind, unknown, unknown>,
  input: unknown,
  path: Path,
  reportIssues: boolean,
): InternalParseResult<unknown> {
  if (!definition.is(input)) {
    return reportIssues ? failure(issue([...path], 'invalid_type', definition.expected, input)) : QUIET_FAILURE
  }

  return definition.decode ? definition.decode(input, [...path]) : success(input)
}

function parseEnumValue(
  definition: EnumDefinition<string | number>,
  input: unknown,
  path: Path,
  reportIssues: boolean,
): InternalParseResult<unknown> {
  // Type boundary: enum structs are defined with string or number literals; by the time we reach this
  // parser the input has already been validated as non-null/undefined and only enum members can match.
  return matchesEnum(definition, input)
    ? success(input)
    : reportIssues
      ? failure(issue([...path], 'invalid_enum', definition.expected, input))
      : QUIET_FAILURE
}

function parseLiteralValue(
  definition: LiteralDefinition<LiteralValue>,
  input: unknown,
  path: Path,
  reportIssues: boolean,
): InternalParseResult<unknown> {
  return Object.is(input, definition.value)
    ? success(input)
    : reportIssues
      ? failure(issue([...path], 'invalid_literal', definition.expected, input))
      : QUIET_FAILURE
}

function parseArrayValue(
  definition: ArrayDefinition,
  input: unknown,
  path: Path,
  useAliases: boolean,
  reportIssues: boolean,
): InternalParseResult<unknown[]> {
  if (!Array.isArray(input)) {
    return reportIssues ? failure(issue([...path], 'invalid_type', 'array', input)) : QUIET_FAILURE
  }

  const output: unknown[] = []
  for (let index = 0; index < input.length; index += 1) {
    const result = parseChildValue(definition.item as RuntimeStruct, input[index], path, index, 'value', useAliases, reportIssues)
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
  reportIssues: boolean,
  cachedField?: { inputKey: string; value: unknown },
  target?: { [key: string]: unknown },
): InternalParseResult<{ [key: string]: unknown }> {
  if (!isPlainObject(input)) {
    return reportIssues ? failure(issue([...path], 'invalid_type', 'object', input)) : QUIET_FAILURE
  }

  const output: { [key: string]: unknown } = target ?? Object.create(null)
  for (const field of resolveStructFields(struct, definition)) {
    const inputKey = useAliases ? field.wireKey : field.key
    const inputValue = cachedField?.inputKey === inputKey ? cachedField.value : hasOwnKey(input, inputKey) ? input[inputKey] : undefined
    const result = parseChildValue(field.struct, inputValue, path, field.key, 'field', useAliases, reportIssues)
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
  reportIssues: boolean,
): InternalParseResult<{ [key: string]: unknown }> {
  if (!isPlainObject(input)) {
    return reportIssues ? failure(issue([...path], 'invalid_type', 'record', input)) : QUIET_FAILURE
  }

  const output: { [key: string]: unknown } = Object.create(null)
  for (const key of Object.keys(input)) {
    const result = parseChildValue(definition.value as RuntimeStruct, input[key], path, key, 'field', useAliases, reportIssues)
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
  reportIssues: boolean,
): InternalParseResult<{ [key: string]: unknown }> {
  if (!isPlainObject(input)) {
    return reportIssues ? failure(issue([...path], 'invalid_type', 'object', input)) : QUIET_FAILURE
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
        const emptyResult = parseChildValue(sectionStruct, {}, path, sectionKey, 'field', useAliases, reportIssues)
        if (emptyResult.ok) {
          output[sectionKey] = emptyResult.value
          continue
        }
      }
      return reportIssues
        ? failure(issue([...path, sectionKey], 'missing_key', expectedType(sectionStruct[DEFINITION]), undefined))
        : QUIET_FAILURE
    }

    const result = parseChildValue(sectionStruct, sectionValue, path, sectionKey, 'field', useAliases, reportIssues)
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
  reportIssues: boolean,
): InternalParseResult<unknown> {
  return parseValueAtPath(definition.struct as RuntimeStruct, input, path, mode, useAliases, reportIssues)
}

function parseTupleValue(
  definition: TupleDefinition,
  input: unknown,
  path: Path,
  useAliases: boolean,
  reportIssues: boolean,
): InternalParseResult<unknown[]> {
  if (!Array.isArray(input) || input.length !== definition.items.length) {
    return reportIssues ? failure(issue([...path], 'invalid_type', `tuple of length ${definition.items.length}`, input)) : QUIET_FAILURE
  }

  const output: unknown[] = []
  for (let index = 0; index < definition.items.length; index += 1) {
    const result = parseChildValue(definition.items[index] as RuntimeStruct, input[index], path, index, 'value', useAliases, reportIssues)
    if (!result.ok) {
      return result
    }
    output.push(result.value)
  }
  return success(output)
}

function parseUnionValue(
  definition: UnionDefinition,
  input: unknown,
  path: Path,
  useAliases: boolean,
  reportIssues: boolean,
): InternalParseResult<unknown> {
  const reportCandidateIssues = reportIssues && hasErrorMap()
  for (const option of definition.options) {
    const result = parseValueAtPath(option as RuntimeStruct, input, path, 'value', useAliases, reportCandidateIssues)
    if (result.ok) {
      return result
    }
  }
  return reportIssues ? failure(issue([...path], 'invalid_union', definition.expected, input)) : QUIET_FAILURE
}

function parseDiscriminatedUnionValue(
  definition: DiscriminatedUnionDefinition,
  input: unknown,
  path: Path,
  useAliases: boolean,
  reportIssues: boolean,
): InternalParseResult<unknown> {
  if (!isPlainObject(input)) {
    return reportIssues ? failure(issue([...path], 'invalid_type', 'object', input)) : QUIET_FAILURE
  }

  const discriminatorPath = [...path, definition.discriminator]
  if (!useAliases) {
    const value = hasOwnKey(input, definition.discriminator) ? input[definition.discriminator] : undefined
    if (value === undefined) {
      return reportIssues ? failure(issue(discriminatorPath, 'missing_key', definition.expected, undefined)) : QUIET_FAILURE
    }
    const target = definition.map.get(value)
    if (!target) {
      return reportIssues ? failure(issue(discriminatorPath, 'invalid_union', definition.expected, value)) : QUIET_FAILURE
    }
    const runtime = target as RuntimeStruct
    return parseObjectValue(runtime, runtime[DEFINITION] as ObjectDefinition, input, path, false, reportIssues, {
      inputKey: definition.discriminator,
      value,
    })
  }

  for (const wireKey of definition.discriminatorWireKeys ?? []) {
    if (!hasOwnKey(input, wireKey)) {
      continue
    }

    const value = input[wireKey]
    if (value === undefined) {
      return reportIssues ? failure(issue(discriminatorPath, 'missing_key', definition.expected, undefined)) : QUIET_FAILURE
    }
    const target = definition.map.get(value) as RuntimeStruct | undefined
    if (!target || definition.wireKeyByValue?.get(value) !== wireKey) {
      return reportIssues ? failure(issue(discriminatorPath, 'invalid_union', definition.expected, value)) : QUIET_FAILURE
    }
    return parseObjectValue(target, target[DEFINITION] as ObjectDefinition, input, path, true, reportIssues, {
      inputKey: wireKey,
      value,
    })
  }
  return reportIssues ? failure(issue(discriminatorPath, 'missing_key', definition.expected, undefined)) : QUIET_FAILURE
}

function parseIntersectionValue(
  definition: IntersectionDefinition,
  input: unknown,
  path: Path,
  useAliases: boolean,
  reportIssues: boolean,
): InternalParseResult<unknown> {
  if (definition.objectSides && isPlainObject(input)) {
    const merged: { [key: string]: unknown } = Object.create(null)
    for (const option of definition.options) {
      const runtime = option as RuntimeStruct
      const result = parseObjectValue(
        runtime,
        runtime[DEFINITION] as ObjectDefinition,
        input,
        path,
        useAliases,
        reportIssues,
        undefined,
        merged,
      )
      if (!result.ok) {
        return result
      }
    }
    return success(merged)
  }

  if (useAliases && !definition.objectSides) {
    let last: unknown
    for (const option of definition.options) {
      const result = parseValueAtPath(option as RuntimeStruct, input, path, 'value', useAliases, reportIssues)
      if (!result.ok) {
        return result
      }
      last = result.value
    }
    return success(last)
  }

  const merged: { [key: string]: unknown } = Object.create(null)
  let merge = true
  let last: unknown
  for (const option of definition.options) {
    const result = parseValueAtPath(option as RuntimeStruct, input, path, 'value', useAliases, reportIssues)
    if (!result.ok) {
      return result
    }
    last = result.value
    if (merge && isPlainObject(last)) {
      Object.assign(merged, last)
    } else {
      merge = false
    }
  }
  return success(merge ? merged : last)
}

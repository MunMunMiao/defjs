import { StructError } from './errors'
import { isStruct } from './guards'
import type { AnySchema, Infer, SchemaIssue } from './types'

export interface StandardSchemaResultSuccess<TOutput> {
  readonly value: TOutput
}

export interface StandardSchemaIssueLike {
  readonly message?: string
  readonly path?: readonly (number | string)[]
}

export interface StandardSchemaResultFailure {
  readonly issues: readonly StandardSchemaIssueLike[]
}

export interface StandardSchemaProps<TInput, TOutput> {
  readonly types?: {
    readonly input: TInput
    readonly output: TOutput
  }
  readonly validate: (
    value: unknown,
  ) =>
    | StandardSchemaResultFailure
    | StandardSchemaResultSuccess<TOutput>
    | Promise<StandardSchemaResultFailure | StandardSchemaResultSuccess<TOutput>>
  readonly vendor?: string
  readonly version?: number
}

export interface StandardSchemaLike<TInput = unknown, TOutput = TInput> {
  readonly '~standard': StandardSchemaProps<TInput, TOutput>
}

export type CompatibleSchema<TInput = unknown, TOutput = TInput> = AnySchema | StandardSchemaLike<TInput, TOutput>
export type AnyCompatibleSchema = CompatibleSchema<any, any>

type StructInput<T> = T extends { readonly _struct: { readonly input: infer TInput } } ? TInput : never

export type CompatibleInput<T> = T extends AnySchema ? StructInput<T> : T extends StandardSchemaLike<infer TInput, any> ? TInput : never

export type CompatibleOutput<T> = T extends AnySchema ? Infer<T> : T extends StandardSchemaLike<any, infer TOutput> ? TOutput : never

export function isStandardSchemaLike(value: unknown): value is StandardSchemaLike {
  if (typeof value !== 'object' || value === null || !('~standard' in value)) {
    return false
  }

  const props = (value as StandardSchemaLike)['~standard']
  return typeof props?.validate === 'function'
}

export function isCompatibleSchema(value: unknown): value is AnyCompatibleSchema {
  return isStruct(value) || isStandardSchemaLike(value)
}

export async function parseCompatibleSchema<TSchema extends AnyCompatibleSchema>(
  schema: TSchema,
  value: unknown,
): Promise<CompatibleOutput<TSchema>> {
  if (isStruct(schema)) {
    const [err, val] = await schema.parseAsync(value)
    if (err) {
      throw err
    }
    return val as CompatibleOutput<TSchema>
  }

  const result = await schema['~standard'].validate(value)
  if ('issues' in result) {
    throw new StructError(mapStandardIssues(result.issues))
  }

  return result.value as CompatibleOutput<TSchema>
}

function mapStandardIssues(issues: readonly StandardSchemaIssueLike[]): SchemaIssue[] {
  return issues.map(issue => ({
    code: 'custom',
    expected: 'valid value',
    message: issue.message ?? 'Schema parse failed',
    path: Array.isArray(issue.path) ? [...issue.path] : [],
    received: undefined,
  }))
}

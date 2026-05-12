import { type AnySchema, type InputOf, isSchema, SchemaError, type SchemaIssue, type TypeOf } from './schema'

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

export type CompatibleInputOf<T> = T extends AnySchema ? InputOf<T> : T extends StandardSchemaLike<infer TInput, any> ? TInput : never

export type CompatibleOutputOf<T> = T extends AnySchema ? TypeOf<T> : T extends StandardSchemaLike<any, infer TOutput> ? TOutput : never

export function isStandardSchemaLike(value: unknown): value is StandardSchemaLike {
  if (typeof value !== 'object' || value === null || !('~standard' in value)) {
    return false
  }

  const props = (value as StandardSchemaLike)['~standard']
  return typeof props?.validate === 'function'
}

export function isCompatibleSchema(value: unknown): value is AnyCompatibleSchema {
  return isSchema(value) || isStandardSchemaLike(value)
}

export async function parseCompatibleSchema<TSchema extends AnyCompatibleSchema>(
  schema: TSchema,
  value: unknown,
): Promise<CompatibleOutputOf<TSchema>> {
  if (isSchema(schema)) {
    const [err, val] = schema.parse(value)
    if (err) {
      throw err
    }
    return val as CompatibleOutputOf<TSchema>
  }

  const result = await schema['~standard'].validate(value)
  if ('issues' in result) {
    throw new SchemaError(mapStandardIssues(result.issues))
  }

  return result.value as CompatibleOutputOf<TSchema>
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

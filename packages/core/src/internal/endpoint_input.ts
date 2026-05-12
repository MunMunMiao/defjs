import { type AnyCompatibleSchema, type CompatibleInputOf, type CompatibleOutputOf, parseCompatibleSchema } from '../schema'

export type EndpointInput<TInput extends AnyCompatibleSchema | undefined> = TInput extends AnyCompatibleSchema
  ? CompatibleInputOf<TInput>
  : unknown

export type ParsedInput<TInput extends AnyCompatibleSchema | undefined> = TInput extends AnyCompatibleSchema
  ? CompatibleOutputOf<TInput>
  : unknown

export async function parseEndpointInput<TInput extends AnyCompatibleSchema | undefined>(
  schema: TInput,
  input: EndpointInput<TInput> | undefined,
): Promise<ParsedInput<TInput>> {
  if (!schema) {
    return input as ParsedInput<TInput>
  }

  return (await parseCompatibleSchema(schema, input)) as ParsedInput<TInput>
}

import { type AnyCompatibleSchema, type CompatibleInput, type CompatibleOutput, parseCompatibleSchema } from '../struct/compatible'

export type EndpointInput<TInput extends AnyCompatibleSchema | undefined> = TInput extends AnyCompatibleSchema
  ? CompatibleInput<TInput>
  : unknown

export type ParsedInput<TInput extends AnyCompatibleSchema | undefined> = TInput extends AnyCompatibleSchema
  ? CompatibleOutput<TInput>
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

import type { AnyStruct, Infer } from '../struct'
import { parseStructValue } from '../struct/introspection'

export type StructInput<T> = T extends { readonly _struct: { readonly input: infer TInput } } ? TInput : never

export type EndpointInput<TInput extends AnyStruct | undefined> = TInput extends AnyStruct ? StructInput<TInput> : unknown

export type ParsedInput<TInput extends AnyStruct | undefined> = TInput extends AnyStruct ? Infer<TInput> : unknown

export async function parseEndpointInput<TInput extends AnyStruct | undefined>(
  schema: TInput,
  input: EndpointInput<TInput> | undefined,
): Promise<ParsedInput<TInput>> {
  if (!schema) {
    return input as ParsedInput<TInput>
  }

  return parseStructValue(schema, input) as ParsedInput<TInput>
}

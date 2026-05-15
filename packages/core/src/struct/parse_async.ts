import { parseValue } from './parse'
import type { ParseMode, ParseOptions, ParseResult, Path, RuntimeSchema } from './types'

export async function parseValueAsync(
  schema: RuntimeSchema,
  input: unknown,
  path: Path,
  mode: ParseMode,
  options?: ParseOptions,
): Promise<ParseResult<unknown>> {
  return parseValue(schema, input, path, mode, options)
}

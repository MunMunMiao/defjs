import { applyClientOptions, createHttpClientConfig } from './config'
import type { HttpClientOption } from './option'
import type { HttpCommand, HttpExecuteOptions } from '../http/http'
import { executeHttpCommand } from '../http/http'
import type { RequestOutputShape } from '../http/request'
import type { AnyStruct } from '../struct'

export type HttpClient = {
  execute<TInput extends AnyStruct | undefined, TOutput extends RequestOutputShape | undefined>(
    command: HttpCommand<TInput, TOutput>,
    options?: HttpExecuteOptions,
  ): ReturnType<typeof executeHttpCommand<TInput, TOutput>>
}

export function createHttpClient(...options: HttpClientOption[]): HttpClient {
  const config = applyClientOptions(createHttpClientConfig(), options)

  return {
    execute(command, executeOptions) {
      return executeHttpCommand(config, command, executeOptions)
    },
  }
}

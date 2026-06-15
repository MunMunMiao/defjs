import type { Command } from './command'
import type { ClientConfig } from './config'

export const CLIENT = Symbol('Client')

export type Client = {
  readonly [CLIENT]: ClientConfig

  execute(command: Command, options?: { signal?: AbortSignal }): Promise<unknown>
}

export function isClient(value: unknown): value is Client {
  return typeof value === 'object' && value !== null && CLIENT in value
}

export function getClientConfig(client: Client): ClientConfig {
  if (!isClient(client)) {
    throw new TypeError('Value is not a valid Client instance')
  }

  return client[CLIENT]
}

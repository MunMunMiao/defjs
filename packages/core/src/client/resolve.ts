import { ERR_INVALID_CLIENT } from '../error'
import type { ClientConfig } from './config'

export const CLIENT = Symbol('Client')

export type Client = {
  readonly [CLIENT]: ClientConfig
}

export function isClient(value: unknown): value is Client {
  return typeof value === 'object' && value !== null && CLIENT in value
}

export function getClientConfig(client: Client): ClientConfig {
  if (!isClient(client)) {
    throw ERR_INVALID_CLIENT
  }

  return client[CLIENT]
}

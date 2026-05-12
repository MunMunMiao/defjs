import { ERR_NOT_FOUND_GLOBAL_CLIENT } from '../error'
import type { Client } from './resolve'

let globalClient: Client | undefined

export function getGlobalClient(): Client {
  if (!globalClient) {
    throw ERR_NOT_FOUND_GLOBAL_CLIENT
  }

  return globalClient
}

export function setGlobalClient(client: Client): void {
  globalClient = client
}

export function resetGlobalClient(): void {
  globalClient = undefined
}

/** @deprecated use resetGlobalClient — historic typo kept as alias for backward compat. */
export const restGlobalClient = resetGlobalClient

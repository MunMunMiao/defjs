import type { Client } from './resolve'

let globalClient: Client | undefined

export function getGlobalClient(): Client {
  if (!globalClient) {
    throw new Error('Global client has not been set')
  }

  return globalClient
}

export function setGlobalClient(client: Client): void {
  globalClient = client
}

export function resetGlobalClient(): void {
  globalClient = undefined
}

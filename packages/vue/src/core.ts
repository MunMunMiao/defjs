import type { Client } from '@defjs/core'
import type { App, InjectionKey, Plugin } from 'vue'
import { inject } from 'vue'

/**
 * Injection key for the HTTP client instance.
 */
export const HTTP_CLIENT: InjectionKey<Client> = Symbol('HTTP_CLIENT')

/**
 * Create a Vue Plugin that provides an existing HTTP Client instance.
 *
 * @param client - The Client instance to provide
 * @returns A Vue Plugin object
 */
export function createClientPlugin(client: Client): Plugin {
  return {
    install(app: App) {
      app.provide(HTTP_CLIENT, client)
    },
  }
}

/**
 * Inject the HTTP Client instance from the Vue application context.
 *
 * @returns The injected Client instance
 * @throws Error if no client is provided
 */
export function injectClient(): Client {
  const client = inject(HTTP_CLIENT)
  if (!client) {
    throw new Error('No HTTP client provided. Did you forget to call app.use(createClientPlugin(client))?')
  }
  return client
}

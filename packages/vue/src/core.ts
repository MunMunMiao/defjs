import type { Client, ClientOption, Interceptor } from '@defjs/core'
import { createClient } from '@defjs/core'
import type { App, InjectionKey, Plugin } from 'vue'
import { inject } from 'vue'

/**
 * Injection key for the HTTP client instance.
 */
export const HTTP_CLIENT: InjectionKey<Client> = Symbol('HTTP_CLIENT')

/**
 * Create a ClientOption that sets the endpoint for the HTTP client.
 *
 * @param endpoint - The base URL for API requests (e.g., 'https://api.example.com')
 * @returns A ClientOption function that configures the endpoint
 */
export function withEndpoint(endpoint: string): ClientOption {
  return (config) => {
    config.endpoint = endpoint
  }
}

/**
 * Create a ClientOption that registers interceptors for the HTTP client.
 *
 * @param fns - Factory functions that each return an Interceptor
 * @returns A ClientOption function that configures the interceptors
 */
export function withInterceptors(...fns: (() => Interceptor)[]): ClientOption {
  return (config) => {
    config.interceptors = fns.map((fn) => fn())
  }
}

/**
 * Create a Vue Plugin that provides an HTTP Client instance.
 *
 * @param feature - ClientOption functions to configure the client
 * @returns A Vue Plugin object
 */
export function provideClient(...feature: ClientOption[]): Plugin {
  return {
    install(app: App) {
      const client = createClient(...feature)
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
    throw new Error('No HTTP client provided. Did you forget to call app.use(provideClient(...))?')
  }
  return client
}

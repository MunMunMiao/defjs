import {
  type Client,
  type ClientOption,
  createClient,
  type Interceptor,
  withEndpoint,
  withInterceptors as withClientInterceptors,
} from '@defjs/core'
import type { App, InjectionKey, Plugin } from 'vue'
import { inject, provide } from 'vue'

/**
 * Injection key for the HTTP client instance.
 */
export const HTTP_CLIENT: InjectionKey<Client> = Symbol('HTTP_CLIENT')

/**
 * Create a ClientOption that sets the host/endpoint for the HTTP client.
 *
 * @param host - The base URL for API requests (e.g., 'https://api.example.com')
 * @returns A ClientOption function that configures the endpoint
 */
export function withHost(host: string): ClientOption {
  return (config) => {
    config.endpoint = host
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
    config.interceptors = fns.map(fn => fn())
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
      // Collect host and interceptors from options
      let host = ''
      const interceptors: Interceptor[] = []

      const configProxy: Record<string, any> = {}
      for (const option of feature) {
        option(configProxy as any)
      }

      host = configProxy.endpoint || ''
      if (configProxy.interceptors) {
        interceptors.push(...configProxy.interceptors)
      }

      // Create Client instance
      const client = createClient(
        withEndpoint(host),
        withClientInterceptors(...interceptors)
      )

      // Provide Client instance
      app.provide(HTTP_CLIENT, client)
    }
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

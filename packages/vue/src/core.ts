import type { ClientOption, Interceptor } from '@defjs/core'

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

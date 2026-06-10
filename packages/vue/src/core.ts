import type { ClientOption } from '@defjs/core'

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

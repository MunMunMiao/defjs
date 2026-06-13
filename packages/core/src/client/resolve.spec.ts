import { afterEach, describe, expect, test } from 'vitest'
import { createClient, resolveClientConfig } from './client'
import { resetGlobalClient, setGlobalClient } from './global'
import { withEndpoint } from './index'

describe('client resolve helpers', () => {
  afterEach(() => {
    resetGlobalClient()
  })

  test('should resolve explicit client config before global client', () => {
    const explicitClient = createClient(withEndpoint('https://explicit.example.com/v1'))
    const globalClient = createClient(withEndpoint('https://global.example.com/v1'))

    setGlobalClient(globalClient)

    expect(resolveClientConfig(explicitClient).endpoint).toBe('https://explicit.example.com/v1')
    expect(resolveClientConfig().endpoint).toBe('https://global.example.com/v1')
  })

  test('should throw when resolving client config without explicit or global client', () => {
    expect(() => resolveClientConfig()).toThrowError('Global client has not been set')
  })
})

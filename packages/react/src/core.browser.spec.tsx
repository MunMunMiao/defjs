import type { ClientConfig, Interceptor } from '@defjs/core'
import { cleanup, render } from '@testing-library/react'
import { describe, expect, it, afterEach } from 'vitest'
import { ClientProvider, useClient, withEndpoint, withInterceptors } from './core'

afterEach(cleanup)

describe('withEndpoint', () => {
  it('should return a ClientOption function', () => {
    const option = withEndpoint('https://api.example.com')
    expect(typeof option).toBe('function')
  })

  it('should set endpoint in config', () => {
    const config = {} as ClientConfig
    const option = withEndpoint('https://api.example.com')
    option(config)
    expect(config.endpoint).toBe('https://api.example.com')
  })
})

describe('withInterceptors', () => {
  it('should return a ClientOption function', () => {
    const option = withInterceptors((() => ({})) as unknown as () => Interceptor)
    expect(typeof option).toBe('function')
  })

  it('should set interceptors in config', () => {
    const config = {} as ClientConfig
    const interceptor = (() => ({})) as unknown as () => Interceptor
    const option = withInterceptors(interceptor)
    option(config)
    expect(config.interceptors).toEqual([interceptor()])
  })
})

describe('ClientProvider', () => {
  it('should provide client to child component', () => {
    let injectedClient: unknown

    function Child() {
      injectedClient = useClient()
      return null
    }

    render(
      <ClientProvider>
        <Child />
      </ClientProvider>,
    )

    expect(injectedClient).toBeDefined()
  })

  it('should configure endpoint via withEndpoint', () => {
    let injectedClient: unknown

    function Child() {
      injectedClient = useClient()
      return null
    }

    render(
      <ClientProvider options={[withEndpoint('https://api.example.com')]}>
        <Child />
      </ClientProvider>,
    )

    expect(injectedClient).toBeDefined()
  })
})

describe('useClient', () => {
  it('should throw when no provider is present', () => {
    function Child() {
      useClient()
      return null
    }

    expect(() => render(<Child />)).toThrow('No HTTP client provided')
  })
})

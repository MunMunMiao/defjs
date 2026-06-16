import type { Client, ClientConfig, Interceptor } from '@defjs/core'
import { describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import type { ReactElement } from 'react'
import { ClientProvider, useClient, withEndpoint, withInterceptors } from './core'

function mount(element: ReactElement): { container: HTMLDivElement; unmount: () => void } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  root.render(element)
  return {
    container,
    unmount: () => {
      root.unmount()
      container.remove()
    },
  }
}

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
    let injectedClient: Client | undefined

    function Child() {
      injectedClient = useClient()
      return null
    }

    const { unmount } = mount(
      <ClientProvider>
        <Child />
      </ClientProvider>,
    )

    expect(injectedClient).toBeDefined()
    unmount()
  })

  it('should configure endpoint via withEndpoint', () => {
    let injectedClient: Client | undefined

    function Child() {
      injectedClient = useClient()
      return null
    }

    const { unmount } = mount(
      <ClientProvider options={[withEndpoint('https://api.example.com')]}>
        <Child />
      </ClientProvider>,
    )

    expect(injectedClient).toBeDefined()
    unmount()
  })
})

describe('useClient', () => {
  it('should throw when no provider is present', () => {
    function Child() {
      useClient()
      return null
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    expect(() => {
      root.render(<Child />)
    }).toThrow('No HTTP client provided')

    root.unmount()
    container.remove()
  })
})

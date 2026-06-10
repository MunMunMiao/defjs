import { describe, it, expect } from 'vitest'
import { withHost, withInterceptors } from '../src'

describe('withHost', () => {
  it('should return a ClientOption function', () => {
    const option = withHost('https://api.example.com')
    expect(typeof option).toBe('function')
  })

  it('should set endpoint in config', () => {
    const config = {} as any
    const option = withHost('https://api.example.com')
    option(config)
    expect(config.endpoint).toBe('https://api.example.com')
  })
})

describe('withInterceptors', () => {
  it('should return a ClientOption function', () => {
    const option = withInterceptors(() => ({}))
    expect(typeof option).toBe('function')
  })

  it('should set interceptors in config', () => {
    const config = {} as any
    const interceptor = () => ({})
    const option = withInterceptors(() => interceptor)
    option(config)
    expect(config.interceptors).toEqual([interceptor])
  })
})

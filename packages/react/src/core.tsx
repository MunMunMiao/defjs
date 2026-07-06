'use client'

import type { Client, ClientOption, Interceptor } from '@defjs/core'
import { createClient } from '@defjs/core'
import { createContext, useContext, useState, type ReactNode } from 'react'

const HttpClientContext = createContext<Client | null>(null)

export interface ClientProviderProps {
  options?: ClientOption[]
  children?: ReactNode
}

export function ClientProvider({ options = [], children }: ClientProviderProps) {
  const [client] = useState(() => createClient(...options))

  return <HttpClientContext.Provider value={client}>{children}</HttpClientContext.Provider>
}

export function useClient(): Client {
  const client = useContext(HttpClientContext)

  if (!client) {
    throw new Error('No HTTP client provided. Did you forget to wrap your app in <ClientProvider>?')
  }

  return client
}

export function withEndpoint(endpoint: string): ClientOption {
  return (config) => {
    config.endpoint = endpoint
  }
}

export function withInterceptors(...fns: (() => Interceptor)[]): ClientOption {
  return (config) => {
    config.interceptors = [...(config.interceptors ?? []), ...fns.map((fn) => fn())]
  }
}

'use client'

import type { Client } from '@defjs/core'
import { createContext, createElement, useContext, type ReactNode } from 'react'

const HttpClientContext = createContext<Client | null>(null)

export interface ClientProviderProps {
  client: Client
  children?: ReactNode
}

export function ClientProvider({ client, children }: ClientProviderProps) {
  return createElement(HttpClientContext.Provider, { value: client }, children)
}

export function useClient(): Client {
  const client = useContext(HttpClientContext)

  if (!client) {
    throw new Error('No HTTP client provided. Did you forget to wrap your app in <ClientProvider>?')
  }

  return client
}

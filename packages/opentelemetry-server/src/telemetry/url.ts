export function resolveUrl(endpoint: string, baseEndpoint?: string): string {
  if (!baseEndpoint) {
    return endpoint
  }
  try {
    return new URL(endpoint, baseEndpoint).toString()
  } catch {
    return endpoint
  }
}

export function resolveHttpUrl(endpoint: string, baseEndpoint?: string): { url: string; serverAddress?: string; serverPort?: number } {
  if (!baseEndpoint) {
    return { url: endpoint }
  }
  try {
    const parsed = new URL(endpoint, baseEndpoint)
    return {
      url: parsed.toString(),
      serverAddress: parsed.hostname,
      serverPort: Number.parseInt(parsed.port) || undefined,
    }
  } catch {
    return { url: endpoint }
  }
}

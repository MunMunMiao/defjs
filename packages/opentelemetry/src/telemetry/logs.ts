export interface LogOptions {
  serviceName: string
}

export interface RequestLogger {
  logRequest: (method: string, url: string) => void
  logResponse: (method: string, url: string, status: number, durationMs: number) => void
  logError: (method: string, url: string, error: unknown) => void
}

export function createRequestLogger(_options: LogOptions): RequestLogger {
  return {
    logRequest(_method, _url) {
      // Logs API is not available in @opentelemetry/api v1.x
      // It requires @opentelemetry/api-logs (experimental) or v2.x
    },
    logResponse(_method, _url, _status, _durationMs) {
      // Logs API is not available in @opentelemetry/api v1.x
    },
    logError(_method, _url, _error) {
      // Logs API is not available in @opentelemetry/api v1.x
    },
  }
}

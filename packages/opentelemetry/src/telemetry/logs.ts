import { logs, type Logger } from '@opentelemetry/api'

export interface LogOptions {
  serviceName: string
}

export interface RequestLogger {
  logRequest: (method: string, url: string) => void
  logResponse: (method: string, url: string, status: number, durationMs: number) => void
  logError: (method: string, url: string, error: unknown) => void
}

export function createRequestLogger(options: LogOptions): RequestLogger {
  const logger = logs.getLogger(options.serviceName)

  return {
    logRequest(method, url) {
      logger.emit({
        severityNumber: 9,
        severityText: 'INFO',
        body: `HTTP ${method} ${url}`,
        attributes: {
          'http.request.method': method,
          'url.full': url,
        },
      })
    },
    logResponse(method, url, status, durationMs) {
      logger.emit({
        severityNumber: 9,
        severityText: 'INFO',
        body: `HTTP ${method} ${url} -> ${status} (${durationMs.toFixed(2)}ms)`,
        attributes: {
          'http.request.method': method,
          'url.full': url,
          'http.response.status_code': status,
        },
      })
    },
    logError(method, url, error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.emit({
        severityNumber: 17,
        severityText: 'ERROR',
        body: `HTTP ${method} ${url} failed: ${message}`,
        attributes: {
          'http.request.method': method,
          'url.full': url,
          'error.message': message,
        },
      })
    },
  }
}

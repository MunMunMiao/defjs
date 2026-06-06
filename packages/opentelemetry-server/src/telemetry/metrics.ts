import { type Meter, metrics } from '@opentelemetry/api'

export interface MetricsOptions {
  serviceName: string
}

export interface RequestMetrics {
  meter: Meter
  requestCounter: ReturnType<Meter['createCounter']>
  errorCounter: ReturnType<Meter['createCounter']>
  durationHistogram: ReturnType<Meter['createHistogram']>
}

export function createRequestMetrics(options: MetricsOptions): RequestMetrics {
  const meter = metrics.getMeter(options.serviceName)

  return {
    meter,
    requestCounter: meter.createCounter('http.client.request.count', {
      description: 'Total number of HTTP client requests',
    }),
    errorCounter: meter.createCounter('http.client.request.error', {
      description: 'Total number of HTTP client request errors',
    }),
    durationHistogram: meter.createHistogram('http.client.request.duration', {
      description: 'HTTP client request duration in milliseconds',
      unit: 'ms',
    }),
  }
}

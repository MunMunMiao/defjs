import type { Meter, TextMapPropagator, Tracer } from '@opentelemetry/api'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { MeterProvider } from '@opentelemetry/sdk-metrics'
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'

// Keep both providers isolated to this runner and make their shared shutdown idempotent.

export interface TelemetryFixture {
  exporter: InMemorySpanExporter
  meter: Meter
  propagator: TextMapPropagator
  tracer: Tracer
  shutdown(): Promise<void>
}

export function createTelemetryFixture(): TelemetryFixture {
  const exporter = new InMemorySpanExporter()
  const tracerProvider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] })
  const meterProvider = new MeterProvider()
  let shutdownPromise: Promise<void> | undefined

  return {
    exporter,
    meter: meterProvider.getMeter('defjs-observability-example'),
    propagator: new W3CTraceContextPropagator(),
    tracer: tracerProvider.getTracer('defjs-observability-example'),
    shutdown() {
      shutdownPromise ??= Promise.all([tracerProvider.shutdown(), meterProvider.shutdown()]).then(() => undefined)
      return shutdownPromise
    },
  }
}

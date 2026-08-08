# OTel Lifecycle for Shipment SSE

## Problem

A logistics dashboard subscribes to shipment progress over SSE. The HTTP handshake finishing does not mean the logical stream or its telemetry span has finished. A consumer that stops early must close its stream, await terminal state, and only then let the lifecycle owner shut down telemetry providers.

## Scenario

The client opens `GET https://logistics.invalid/v1/shipments/ship-204/updates`. A local `ReadableStream` emits one native SSE `progress` frame containing the packed shipment and remains open. Defjs parses and validates the event.

`readShipmentCheckpoint` consumes that event, closes the stream, and awaits `stream.closed`. The finished `SSE` span contains `sse.connected` and `sse.aborted`, and the Fetch fixture observes W3C trace propagation.

## Approach

Create isolated telemetry providers, switch on the Struct-decoded event union before returning its narrowed payload, close the stream, inspect its finished span, and shut the providers down in `finally`.

## Source map

- [`src/index.ts`](./src/index.ts): The event definition, business operation, SSE fixture, OTel policy, output, and lifecycle ordering.
- [`src/telemetry.ts`](./src/telemetry.ts): Minimal in-memory tracer and meter provider setup with shutdown.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-observability-otel-sse start
```

## Expected result

```text
{"event":{"shipmentId":"ship-204","status":"packed"},"span":{"events":["sse.connected","sse.aborted"],"name":"SSE"},"traceparentInjected":true}
```

`event` is the Struct-validated shipment payload. The terminal span events show that tracing covered connection through consumer cancellation. `traceparentInjected` reflects the header observed by the local Fetch fixture.

## Key points

- The `progress` switch branch narrows `event.data` to the declared shipment Struct output before telemetry inspection.
- A consumer that stops early owns `close` and must await `closed`.
- Reconnect is disabled so this bounded operation owns one stream lifecycle.
- Random trace IDs stay out of deterministic output.

## Production notes

Use an authenticated HTTPS SSE endpoint and place every active stream under an application lifecycle owner. Define reconnect limits, operation deadlines, parser and queue bounds, and invalid-event policy. During shutdown, close consumers, await their terminal promises, then flush and close telemetry providers.

## Inspiration

- [Defjs OTel SSE interceptor](https://github.com/defjs/defjs/blob/598c218144bc3e5c4844bc8746e08d31010a5309/packages/opentelemetry-server/src/interceptor/sse.ts#L33-L113) is the retained authoritative implementation source for propagation, connected/terminal events, active-stream metrics, and ending the span from `stream.closed`. This runner exercises the aborted path through the public client; reconnect, hooks, metric export, and error paths are excluded.
- [HTML Standard, Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html#server-sent-events) defines event-stream framing and connection behavior. Defjs parses that wire format into Struct-validated events; browser `EventSource`, CORS, reconnection timing, and server implementation remain out of scope.
- [W3C Trace Context, `traceparent`](https://www.w3.org/TR/trace-context/#traceparent-header) defines the propagated carrier shape. The SSE interceptor injects it into the request header, while trust, sampling, and downstream server-span extraction remain deployment responsibilities.

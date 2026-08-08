# Request-Scoped Correlation ID for Order Reads

## Problem

A checkout API reads an order from a downstream service and needs to carry the gateway's incident correlation ID with that call. Storing the value in mutable client-wide headers lets concurrent requests overwrite one another.

The correlation ID belongs to one application request. The Defjs client should receive it through request context and add the header only when that request is dispatched.

## Scenario

The checkout request for `order-1042` carries correlation ID `checkout-req-1042`. `readCorrelatedOrder` stores that value in a fresh `HttpContext`, and an interceptor adds `x-correlation-id` to the downstream request. A local Fetch fixture captures the header and returns the typed packed order.

The `.invalid` endpoint and injected Fetch implementation keep execution deterministic and offline.

## Approach

Create a fresh request context for the bounded correlation value and let an interceptor add it only at dispatch, keeping the shared client free of mutable request metadata.

## Source map

- [`src/index.ts`](./src/index.ts): The complete example, including the request definition, context interceptor, business operation, fixture, and runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-context-correlation-id start
```

## Expected result

```text
{"correlationId":"checkout-req-1042","order":{"id":"order-1042","status":"packed"}}
```

`correlationId` is the value observed at the Fetch boundary. `order` is the Struct-validated response returned by the business operation.

## Key points

- Correlation belongs to one dispatch context, not mutable client-wide state.
- The interceptor owns wire propagation; business code owns the correlation value.
- Correlation IDs should not be used as unbounded metric labels.
- A custom correlation header complements rather than replaces W3C trace context.

## Production notes

Authenticate the ingress that supplies the ID, or generate one when no trusted value exists. Define and enforce an application-specific length and character policy before dispatch. Forward correlation only to reviewed origins, and configure log access and retention for any system that records it.

## Inspiration

- [Elasticsearch JavaScript client observability guidance](https://github.com/elastic/elasticsearch-js/blob/cdf90c0a536c18a8771b2cef3cc6ff6964f0048c/docs/reference/observability.md#L380-L417) is the retained official source for attaching request-specific opaque context to downstream calls. Defjs expresses that rule with `HttpContext` plus an interceptor; Elasticsearch diagnostic events, its client metadata model, and backend correlation are not reproduced.
- [RFC 9110, Field Values](https://www.rfc-editor.org/rfc/rfc9110.html#section-5.5) defines HTTP field-value constraints and the danger of CR, LF, and NUL in field values. Header validation remains an application responsibility outside this minimal propagation example.

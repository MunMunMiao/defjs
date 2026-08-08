# Bounded Shipment Webhook Delivery

## Problem

An order service sends `shipment.ready` to a merchant integration. A completed HTTP `204` confirms receiver acceptance, but a sender-side timeout remains ambiguous and must not be reported as delivery.

The application needs a validated mutation body, one attempt, and an explicit timeout outcome.

## Scenario

Both local requests post `deliveryId`, literal event `shipment.ready`, `orderId`, and `shipmentId` to `POST /webhooks/order-events`. `delivery-1001` receives `204`. The receiver delays `delivery-1002` beyond the 20 ms Defjs timeout; aborting that request also clears the pending local response timer.

Execution uses injected Fetch only and performs no retry.

## Approach

Send each validated shipment event once with a Defjs timeout, classify the accepted and timed-out outcomes separately, and make the local delayed response clear its timer when aborted.

## Source map

- [`src/index.ts`](./src/index.ts): Request definition, exported sender, local receiver fixture, timeout cleanup, and runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-webhook-delivery start
```

## Expected result

```text
{"delivered":{"kind":"delivered"},"timedOut":{"kind":"timeout"}}
```

The first outcome follows a validated `204`; the second preserves delivery ambiguity after the service deadline.

## Key points

- HTTP acceptance and sender timeout are different business facts.
- A timeout does not prove that the receiver performed no work.

## Production notes

Sign the final request bytes, persist delivery identity, and require receiver-side idempotency before adding bounded retries with the same delivery ID.

## Inspiration

- [RFC 9110 status code semantics](https://www.rfc-editor.org/rfc/rfc9110.html#section-15) separates successful 2xx responses from 5xx server failures.
- [Prometheus Alertmanager webhook notifier](https://github.com/prometheus/alertmanager/blob/949777a35bf92dd6e31c381db17afd716ed7b004/notify/webhook/webhook.go#L78-L152) demonstrates JSON webhook delivery under request context with explicit response-status handling.

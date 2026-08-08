# HMAC Webhook Verification for Captured Payments

## Problem

A payment service tells an order system that funds were captured. The receiver must authenticate the exact bytes delivered over HTTP and must not accept the same signed delivery twice.

The example signs the final Defjs text body together with version, timestamp, message ID, method, and path. The receiver verifies those raw bytes, enforces a five-minute age limit, parses one payment event, and reserves its message ID.

## Scenario

The sender posts `payment.captured` for `order-1042` to `POST https://payments.invalid/webhooks/payments`. An interceptor adds deterministic HMAC-SHA-256 headers for timestamp `1700000000` and message ID `payment-1042`. The local receiver verifies the native `Request` body before JSON decoding and returns `204`.

After verification, the receiver reserves the message ID before returning the typed event; a later reuse would be rejected by that same policy. The runner stays on the single accepted delivery and prints no secret or signature bytes.

## Approach

Validate the payment object with its request Struct, then sign the final serialized JSON bytes together with route, timestamp, and message ID. The receiver verifies that framing before decoding and reserving the message ID.

## Source map

- [`src/index.ts`](./src/index.ts): Webhook contract, HMAC framing, sender interceptor, receiver verification, payment operation, and local runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-auth-hmac-webhook start
```

## Expected result

```text
{"orderId":"order-1042","status":204}
```

`status: 204` means the local receiver authenticated the exact bytes, checked freshness, reserved the message ID, and decoded `orderId`.

## Key points

- Derive `PaymentCaptured` from the same Struct that validates and serializes the outgoing body before signing.
- Verify raw request bytes before text decoding or JSON parsing.
- Timestamp checks bound delivery age; message-ID reservation prevents reuse inside that window.
- The check and insertion are synchronous after cryptographic verification, which provides one-process replay exclusion.

## Production notes

Load versioned secrets from a secret manager or HSM and support controlled rotation. Capture the raw request body before framework JSON parsing, cap body size, synchronize clocks, and redact signature headers. Replace the in-memory set with an atomic shared TTL operation such as `SET key value NX PX ttl`, then preserve downstream idempotency by event identity across all receiver instances.

## Inspiration

- [RFC 2104, HMAC](https://www.rfc-editor.org/rfc/rfc2104.html) defines keyed hashing over an exact message. This example constructs that message from final Defjs request bytes and request context, then uses Web Crypto HMAC-SHA-256.
- [Grafana Alerting HMAC implementation](https://github.com/grafana/alerting/blob/7e7dceda6e6b727fedd4e8f2edb8f9aadf7065da/http/hmac.go#L17-L91) is the retained official project reference for computing and checking webhook HMAC values. Defjs places signing after serialization and adds freshness plus message identity.
- [Stripe webhook signature guidance](https://docs.stripe.com/webhooks/signature) requires verification against the raw body and describes timestamp-based replay tolerance. This receiver adopts those principles with its own header and canonical-message format.

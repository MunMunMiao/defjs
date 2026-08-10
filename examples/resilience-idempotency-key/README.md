# Idempotency Keys for Checkout Payments

## Problem

A checkout worker submits payment for `order-874` and loses confidence in the first response. Creating a new request identity for the retry can create a second charge.

One logical payment should retain one Defjs command and one `Idempotency-Key` across replay, allowing the receiver to return the first result.

## Scenario

The runner creates one payment command for 12500 USD cents with key `payment-order-874-attempt-1`. The local receiver stores the delivered body bytes with `pay-9001`. Executing the same command again sends the same key and bytes, so the receiver returns that payment with `replayed: true`; a different payload under the key is rejected before JSON decoding.

The in-memory map demonstrates receiver behavior only; production storage must be durable and atomic with payment creation.

## Approach

Freeze one payment command with its key and serialized body, execute that same command twice, and let the local receiver compare delivered bytes before returning its stored replay.

## Source map

- [`src/index.ts`](./src/index.ts): Payment request, operation factory, local idempotency receiver, and runner.

## Run in a Repository Checkout

From the repository root:

```sh
pnpm --silent --filter @defjs/example-resilience-idempotency-key start
```

## Use the Bundled Reference

Published `@defjs/*` packages include this README and `src/index.ts` as source-only reference material; they intentionally do not include the workspace manifest or runner. Copy `src/index.ts` into an application that already installs `@defjs/core`, then compile and run it with that application's TypeScript toolchain.

## Expected result

```text
{"paymentId":"pay-9001","replayed":true}
```

The replay names `pay-9001`, showing that the second execution retrieved the existing payment instead of creating another one.

## Key points

- The operation owner retains the key across an unknown outcome.
- The receiver binds each key to the delivered request bytes before returning an existing result.
- Idempotency prevents duplicate acceptance within the receiver's retention scope; it does not prove settlement.

## Production notes

Generate high-entropy keys, bind each stored key to the authenticated scope and request parameters, and atomically persist processing state plus the final response. Define a retention window and make concurrent duplicates wait for or retrieve the committed result.

## Inspiration

- [stripe-node idempotency key generation](https://github.com/stripe/stripe-node/blob/dea3ce7ecdf7fe3ae9d68391b9512075db521ef7/src/RequestSender.ts#L336-L355) is the retained client reference for assigning operation identity.
- [stripe-node retry reuse](https://github.com/stripe/stripe-node/blob/dea3ce7ecdf7fe3ae9d68391b9512075db521ef7/src/RequestSender.ts#L577-L590) shows retries preserving the idempotency key.
- [Stripe API idempotent requests](https://docs.stripe.com/api/idempotent_requests) documents returning the first result for a repeated operation identity.

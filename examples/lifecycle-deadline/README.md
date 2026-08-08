# Settlement Report Deadlines and Caller Cancellation

## Problem

A reconciliation worker reads settlement reports before closing a billing period. A provider can accept a request but answer too late, while the caller can independently stop wanting the report when its view or job closes.

Those outcomes need different business meanings: the operation maps Defjs `TIMEOUT` to `deadline_exceeded` and caller-driven `ABORTED` to `cancelled`.

## Scenario

Two local report requests use the same 25 ms Defjs deadline. The first reaches the fixture and is immediately ended by a caller-owned `AbortController`. The second is allowed to wait for a fixture response scheduled after 100 ms, so the Defjs deadline ends it first. Each fixture timer and abort listener is removed when its request terminates.

## Approach

Combine Defjs's fixed deadline with an independent caller signal, make the local pending requests abort-aware, and remove each timer and listener when either cancellation source wins.

## Source map

- [`src/index.ts`](./src/index.ts): Settlement contract, deadline policy, slow local fixture, caller cancellation, cleanup, and output.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-lifecycle-deadline start
```

Execution is local and offline. It makes no external request, clears both fixture timers and listeners, prints one JSON object, and exits after both operations settle.

## Expected result

```text
{"deadline":{"kind":"deadline_exceeded"},"callerCancellation":{"kind":"cancelled"}}
```

`deadline` identifies provider latency against the service budget. `callerCancellation` identifies lost caller demand rather than a provider timeout.

## Key points

- A deadline bounds provider work; caller cancellation expresses lost demand.
- The caller owns its controller, while the business operation owns the service timeout.
- The first reason delivered to the composed signal determines the Defjs transport code.

## Production notes

Choose the deadline from the provider SLA and the remaining job budget. Abort caller signals during shutdown, preserve the two classifications in metrics, and place any retry budget outside this single-attempt operation.

## Inspiration

- [OpenAI Node client request construction](https://github.com/openai/openai-node/blob/228c224393ef4bf3bda2a9d7eb40f387499299b5/src/client.ts#L999-L1017) is the retained official source showing caller cancellation composed with a request timeout. Defjs exposes the same separation as `{ signal, timeout }`; OpenAI's request options, retries, and error hierarchy are outside this example.
- [DOM Standard, dependent abort signals](https://dom.spec.whatwg.org/#abortsignal-dependent) defines composed signals and first-reason propagation. Defjs performs the composition, while this application owns the timeout value and semantic classification.

# Vue Reactive Customer Search Cancellation

## Problem

A support agent narrows a customer lookup from `morgan` to `morgan lee`. If both watcher requests remain active, the slower broad response can replace the precise identity in the visible list.

## Scenario

The first watcher run executes `GET /v1/customers/search?query=morgan`, and the local Fetch fixture holds it until its `AbortSignal` fires. Changing the public query to `morgan lee` invalidates that run, aborts its request, and starts the replacement request for customer `cus-204`, Morgan Lee.

Only the latest validated customer list is assigned to component state.

## Approach

Register synchronous watcher cleanup for each query, hold the broad request until invalidation aborts it, publish only the precise result, and stop the watcher by unmounting the app.

## Source map

- [`src/index.ts`](./src/index.ts): Request definition, reactive business component, two local responses, and runner.
- [`src/fixture.ts`](./src/fixture.ts): Small abort barrier for the one stale Fetch request.
- [`src/renderer.ts`](./src/renderer.ts): Minimal Vue host renderer for local component lifecycle.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-vue-reactive-request start
```

Execution is deterministic, local, offline, and uses no timing delay.

## Expected result

```text
{"query":"morgan lee","customers":[{"customerId":"cus-204","name":"Morgan Lee"}]}
```

The output contains only the current query and the customer list written by its validated response.

## Key points

- Call `injectClient()` during `setup()`, while Vue has an active injection context.
- Register watcher cleanup before starting asynchronous work.
- Check the owner signal before publishing errors or results from an invalidated run.

## Production notes

Propagate the signal through the real customer-search transport. Debouncing, caching, retries, and shared-request cancellation should remain separate policies that preserve watcher-run ownership.

## Inspiration

- [Vue watchers](https://github.com/vuejs/docs/blob/33ff72af9008c68e05360de34ef3e96e74bf70c9/src/guide/essentials/watchers.md#L369-L420) documents reactive side effects and invalidation.
- [Vue watcher cleanup constraints](https://github.com/vuejs/docs/blob/33ff72af9008c68e05360de34ef3e96e74bf70c9/src/guide/essentials/watchers.md#L451-L489) requires cleanup registration during the synchronous watcher callback.
- [DOM Standard, `AbortController`](https://dom.spec.whatwg.org/#interface-abortcontroller) defines one-way owner cancellation.

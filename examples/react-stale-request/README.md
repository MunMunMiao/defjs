# React Latest-Wins Catalog Search

## Problem

A warehouse buyer narrows a search from `thermal labels` to `thermal label printer`. If both effect requests remain active, the slower broad response can overwrite the precise product list.

## Scenario

The first effect executes `GET /v1/catalog/search?query=thermal+labels`, and the local Fetch fixture holds that request until its `AbortSignal` fires. React then replaces the prop with `thermal label printer`; effect cleanup aborts the broad request, and the replacement returns the Zebra ZD421 result.

Only the latest validated products are published.

## Approach

Give each query effect its own controller, mount the broad request at an abort barrier, replace the prop with the precise query, and unmount after both cancellation and the latest result settle.

## Source map

- [`src/index.ts`](./src/index.ts): Request definition, latest-wins effect, two local responses, and runner.
- [`src/fixture.ts`](./src/fixture.ts): Small abort barrier for the one stale Fetch request.
- [`src/renderer.ts`](./src/renderer.ts): Minimal React renderer with update/unmount support and act-global cleanup.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-react-stale-request start
```

Execution is deterministic, local, offline, and uses no timing delay.

## Expected result

```text
{"query":"thermal label printer","products":[{"name":"Zebra ZD421 label printer","sku":"ZD421"}]}
```

The output contains only the precise query and its validated product; cancellation remains an ownership detail inside the effect.

## Key points

- The effect that starts a request owns its controller.
- Cleanup runs before the replacement effect and aborts only the superseded request.
- The aborted guard runs before errors or result publication, so cancellation cannot become stale UI state.

## Production notes

Propagate the signal through the real catalog transport. Add debouncing, caching, and retries outside this ownership rule, and preserve per-consumer cancellation if requests are deduplicated.

## Inspiration

- [TanStack Query cancellation guide](https://github.com/TanStack/query/blob/fd50fa14d283c7d6664a796f758498d1ad5bfce7/docs/framework/react/guides/query-cancellation.md#L20-L39) documents passing an `AbortSignal` to inactive query work.
- [React `useEffect`](https://react.dev/reference/react/useEffect) defines cleanup before replacement and on unmount.
- [DOM Standard, `AbortController`](https://dom.spec.whatwg.org/#interface-abortcontroller) defines one-way cancellation and abort reasons.

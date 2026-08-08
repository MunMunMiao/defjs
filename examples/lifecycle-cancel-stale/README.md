# Latest-Wins Catalog Search Cancellation

## Problem

A procurement analyst searches a warehouse catalog while typing. If an earlier broad request finishes after a later precise request, its stale products can replace the result list the analyst is currently using.

The search owner must cancel superseded work and also check ownership before publishing a completed response. The second check keeps stale data out even when an injected or third-party Fetch implementation ignores its `AbortSignal`.

## Scenario

The analyst searches for `thermal labels`, and the local fixture holds that response after the request starts. The analyst then searches for `thermal label printer`; `LatestCatalogSearch` aborts the first owner and publishes the validated Zebra printer match. The fixture releases the old `200` response afterward, but the ownership check classifies it as `ABORTED` instead of returning stale matches.

## Approach

Let one latest-wins owner abort the superseded search and reject its eventual response after the precise search has completed. The runner releases barriers and cancels remaining work in `finally`.

## Source map

- [`src/index.ts`](./src/index.ts): Catalog request definition, latest-wins business owner, local Fetch fixture, execution, cleanup, and output.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-lifecycle-cancel-stale start
```

Execution is local and offline. It opens no listener, uses no ordering timer, releases the held fixture request, and awaits both searches before exiting.

## Expected result

```text
{"current":["Zebra ZD421 thermal label printer"],"superseded":"ABORTED"}
```

`current` is the only publishable catalog result. `superseded` shows that the broad response remained stale even though its transport eventually returned HTTP `200`.

## Key points

- The application surface that knows which search is current must own cancellation.
- Conditional cleanup prevents an older request from clearing ownership of a newer request.
- Transport abort reclaims cooperative work; the final identity check protects publication independently.

## Production notes

Keep one `LatestCatalogSearch` for the lifetime of the search surface and call `cancel()` during teardown. Replace the fixture with the authenticated catalog transport, continue propagating the signal, and add debouncing or caching only if those layers preserve latest-wins ownership.

## Inspiration

- [TanStack Query cancellation guide](https://github.com/TanStack/query/blob/fd50fa14d283c7d6664a796f758498d1ad5bfce7/docs/framework/react/guides/query-cancellation.md#L20-L39) is the retained official guidance that an operation receives an `AbortSignal` and becomes cancellable when its owner makes it inactive. Defjs expresses that handoff through `client.execute(command, { signal })`; TanStack cache state, framework adapters, and query retry behavior are not reproduced.
- [DOM Standard, `AbortSignal`](https://dom.spec.whatwg.org/#abortsignal) defines abort state, reason propagation, and signal composition. This owner creates and aborts controllers while Defjs consumes the signal; deciding which catalog query is stale remains application policy.

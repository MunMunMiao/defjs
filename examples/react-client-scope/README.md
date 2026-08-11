# React Client Scope for Support Service Routing

## Problem

A support workspace shows a case queue, while a nested refund-review panel talks to a separate service. Creating a client in every consumer loses shared provider ownership; using one endpoint for the whole tree sends refund work to the support service.

## Scenario

`SupportWorkspace` places `case-queue` under a client for `https://support.fixture.invalid`. A nested `ClientProvider` places `refund-review` under `https://refunds.fixture.invalid`. Each view executes `GET /v1/summary?view=<view>` with the nearest Defjs client.

A local Fetch function derives `{ service, view }` from the native `Request` URL, so the printed summaries make the selected service visible without external traffic.

## Approach

Mount a root support `ClientProvider` with a nested refunds provider, let each view resolve its nearest client, wait for both effects, and unmount the renderer before reporting routing.

## Source map

- [`src/index.ts`](./src/index.ts): Request definition, scoped provider tree, business callbacks, local Fetch implementation, and runner.
- [`src/renderer.ts`](./src/renderer.ts): Minimal React test-renderer mount/unmount adapter and temporary act-global cleanup.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-react-client-scope start
```

Execution is deterministic, local, offline, and opens no listener.

## Expected result

```text
{"caseQueue":"support","refundReview":"refunds"}
```

The case queue resolves through the outer provider, while refund review resolves through the nearest nested provider.

## Key points

- `ClientProvider` exposes the exact client instance created by the application.
- React context resolves the nearest matching provider.
- Service authorization and dynamic endpoint replacement remain application policy.

## Production notes

Replace the local Fetch implementation with transports scoped to the support and refund origins. Configure credentials independently, keep providers at stable route boundaries, and cancel component-owned requests during teardown.

## Inspiration

- [Defjs React scope test](https://github.com/defjs/defjs/blob/598c218144bc3e5c4844bc8746e08d31010a5309/packages/react/src/e2e.browser.spec.tsx#L90-L176) is the authoritative project example of shared outer clients and nearest nested-provider resolution.
- [React `useContext`](https://react.dev/reference/react/useContext) documents nearest-provider lookup in the rendered tree.

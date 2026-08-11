# Vue Client Scope for Logistics Service Routing

## Problem

A logistics application shows a shipment board, while a nested customs panel talks to a separate service. Per-component clients lose shared app ownership; one global endpoint routes customs work to the logistics API.

## Scenario

The app plugin provides a client for `https://logistics.fixture.invalid` to `shipment-board`. `CustomsScope` provides a nearer client for `https://customs.fixture.invalid` to `customs-holds`. Both views execute `GET /v1/summary?view=<view>` through `injectClient()`.

A local Fetch function derives `{ service, view }` from the native `Request` URL, making the selected injection scope visible without external traffic.

## Approach

Install the logistics client as an app plugin, provide a nearer customs client inside the component tree, wait for both injected-client requests, and unmount before reporting scope resolution.

## Source map

- [`src/index.ts`](./src/index.ts): Request definition, app and nested client scopes, local Fetch implementation, and runner.
- [`src/renderer.ts`](./src/renderer.ts): Minimal Vue host renderer used to run component lifecycle without a browser DOM.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-vue-client-scope start
```

Execution is deterministic, local, offline, and opens no listener.

## Expected result

```text
{"customsHolds":"customs","shipmentBoard":"logistics"}
```

The shipment board resolves through the plugin client, while customs holds resolves through the nearest subtree provider.

## Key points

- Create the app client explicitly and install `createClientPlugin(client)` for the intended scope.
- Vue injection resolves the nearest matching `HTTP_CLIENT` provider.
- Create a subtree override once in `setup()` so its descendants share that client.

## Production notes

Replace local Fetch with transports restricted to the logistics and customs origins. Keep provider scopes stable, configure credentials independently, and cancel component-owned requests during teardown.

## Inspiration

- [Defjs Vue scope test](https://github.com/defjs/defjs/blob/598c218144bc3e5c4844bc8746e08d31010a5309/packages/vue/src/core.browser.spec.ts#L178-L297) is the authoritative project example of shared outer clients and nearest nested injection.
- [Vue dependency injection](https://vuejs.org/guide/components/provide-inject) documents app-level provide and nearest-ancestor resolution.

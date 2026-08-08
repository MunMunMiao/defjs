# Node.js Carrier Requests Through an Environment Proxy

## Problem

A warehouse worker schedules carrier pickups from a Node.js process behind mandatory corporate egress. Platform Fetch does not automatically provide the per-client `EnvHttpProxyAgent` ownership this worker needs, while changing Undici's global dispatcher would affect unrelated traffic.

The Defjs client therefore receives a Fetch adapter that copies its complete native `Request` into Undici and dispatches it through one caller-owned proxy agent.

## Scenario

The worker schedules pickup for `order-1042` at `warehouse-iad-2` through `https://carrier-api.fixture.invalid/operations/v2`. Defjs resolves `POST /operations/v2/pickups`; a network-disabled Undici `MockAgent` beneath the real `EnvHttpProxyAgent` returns pickup `pickup-7001`. The worker awaits proxy-agent shutdown before printing the result.

The explicit fixture proxy options make execution independent of machine environment variables. Production can construct the same agent from reviewed `HTTPS_PROXY`, `HTTP_PROXY`, and `NO_PROXY` settings.

## Approach

Pass the complete Defjs `Request` to a caller-owned `EnvHttpProxyAgent` backed by a network-disabled `MockAgent`, then close whichever dispatchers were acquired in nested `finally` blocks.

## Source map

- [`src/index.ts`](./src/index.ts): Pickup definition, business operation, Fetch-to-Undici bridge, local proxy fixture, execution, cleanup, and output.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-transport-node-env-proxy start
```

Execution is local and offline. `MockAgent.disableNetConnect()` blocks unmatched network traffic, and the runner closes its agent and fixture before returning.

## Expected result

```text
{"endpoint":"https://carrier-api.fixture.invalid/operations/v2","route":"proxy","pickup":{"pickupId":"pickup-7001","state":"scheduled"}}
```

`route` reports that `EnvHttpProxyAgent` selected its proxy factory. `pickup` is the typed response from the single matching local interceptor.

## Key points

- Use a per-client dispatcher in the Defjs Fetch handle instead of mutating Undici's global dispatcher.
- Preserve the complete request when crossing between platform and Undici Fetch implementations.
- The agent owner must await `close()` after its Defjs operations settle.

## Production notes

Create one `EnvHttpProxyAgent` for the worker or another bounded client scope. Stop accepting work during shutdown, await in-flight commands, then await `agent.close()`. Keep proxy credentials out of request headers and logs, configure corporate CA trust, and review every `NO_PROXY` entry.

## Inspiration

- [Undici `EnvHttpProxyAgent`](https://github.com/nodejs/undici/blob/21a8e1ed1843e74c3004a2926c12bb0ceaca6b71/docs/docs/api/EnvHttpProxyAgent.md#L11-L36) is the retained official documentation for environment proxy variables and `NO_PROXY` routing. Defjs adapts it as a per-client Fetch dispatcher and retains caller-owned closure; Undici's real socket pools, CONNECT exchange, proxy authentication, and TLS configuration are excluded from the local runner.
- [Fetch Standard, `Request`](https://fetch.spec.whatwg.org/#request-class) defines method, headers, body, and signal as request state. The adapter preserves those fields while crossing from the platform Request type to Undici's implementation; browser Fetch policy and global dispatcher behavior are not adopted.

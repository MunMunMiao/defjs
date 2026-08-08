# Browser Credential Mode for a Support Session

## Problem

A support console calls a session API on another origin. Fetch defaults to `same-origin`, so the browser will not include cross-origin cookies unless the client selects `credentials: "include"`.

The example demonstrates only that transport setting. Its Node fixture has no cookie jar and does not claim that a cookie was sent or a user was authenticated.

## Scenario

A dedicated client requests `GET https://support-api.invalid/session` with `withCredentials(true)`. The local Fetch fixture observes native `Request.credentials` as `include` and returns a bodyless `204` response.

## Approach

Configure a dedicated client with `withCredentials(true)`, execute the typed session probe locally, and inspect the resulting native `Request.credentials` value without simulating a cookie jar.

## Source map

- [`src/index.ts`](./src/index.ts): Session request, business operation, local credential-mode fixture, client configuration, and output.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-auth-browser-cookie-session start
```

The command performs no external traffic.

## Expected result

```text
{"credentials":"include"}
```

The value is the mode observed by the injected Fetch handle. It is configuration evidence, not proof of a cookie or authenticated session.

## Key points

- `withCredentials(true)` selects Fetch's `include` mode.
- The browser owns cookie selection and `Set-Cookie` processing.
- Credentialed cross-origin responses require an exact server CORS policy and unsafe methods still need XSRF protection.

## Production notes

Replace `fixtureFetch` with browser Fetch and keep the client dedicated to the support API. Configure exact CORS origins and `Access-Control-Allow-Credentials`, issue appropriately scoped secure session cookies, and enforce session validation and XSRF protection on the server.

## Inspiration

- [Fetch Standard, credentials mode](https://fetch.spec.whatwg.org/#concept-request-credentials-mode) defines `same-origin` and `include` and makes the mode part of cookie and authentication processing. Defjs exposes the choice through `withCredentials(true)`; cookie storage, CORS enforcement, and browser privacy policy remain owned by the user agent and server.
- [Appwrite Web SDK request transport](https://github.com/appwrite/sdk-for-web/blob/a5151b7dae3f78ca929f9a59581dd8dbba761636/src/client.ts#L874-L898) is the existing official implementation reference for browser requests using `credentials: "include"`. This example expresses the same transport requirement as a Defjs client option; Appwrite's headers, response handling, upload behavior, and service contract are excluded.

# Browser XSRF Protection for Profile Updates

## Problem

An operations console uses a cookie session for profile updates and can also call a regional API. A same-origin unsafe request needs the console's cookie-to-header XSRF token, while the same token must not be copied to another origin.

The example keeps that placement policy in Defjs `withXSRF` and restores the temporary browser globals used by its Node runner.

## Scenario

The fixture page is `https://console.invalid` with cookie `XSRF-TOKEN=fixture-xsrf-token`. The same profile update is sent once to the console origin and once to `https://regional-api.invalid`. The local Fetch fixture observes the XSRF header on the same-origin request and no such header on the regional request.

## Approach

Borrow deterministic browser `location` and `document.cookie` globals, reuse one XSRF option across same-origin and regional clients, then restore the original descriptors in `finally`.

## Source map

- [`src/index.ts`](./src/index.ts): Profile contract, save operation, browser-global fixture, same-origin and cross-origin clients, cleanup, and output.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-auth-browser-xsrf start
```

The command performs no external traffic and restores both temporary globals before output.

## Expected result

```text
{"crossOrigin":"absent","sameOrigin":"present"}
```

Only the same-origin and cross-origin placement decisions are emitted. The cookie token remains inside the temporary browser fixture.

## Key points

- `withXSRF` copies the configured cookie into the configured header for same-origin unsafe requests.
- The same policy does not copy that token to the regional origin.
- A server must still validate the header against session state; client-side injection alone is not XSRF enforcement.

## Production notes

Use real browser globals and Fetch. Generate unpredictable tokens, bind them to authenticated sessions, compare them server-side, configure exact CORS and cookie attributes, and retain origin checks. XSRF tokens do not mitigate XSS, which needs separate controls.

## Inspiration

- [OWASP Cross-Site Request Forgery Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) recommends custom request headers and double-submit or synchronizer tokens for state-changing requests. Defjs supplies the browser cookie-to-header transport step through `withXSRF`; token generation, session binding, comparison, origin validation, and XSS defense remain application and server responsibilities.
- [Axios XSRF request configuration](https://github.com/axios/axios/blob/311fcc5c8d989b7248f05d390bb83bfbfb009977/lib/helpers/resolveConfig.js#L78-L100) is the existing official implementation reference for reading a named cookie and defaulting header injection to same-origin requests. This example adapts that rule to Defjs clients with explicit origins; Axios adapters, opt-in cross-origin overrides, and broader request configuration are deliberately excluded.

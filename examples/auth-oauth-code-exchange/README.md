# OAuth 2.0 Authorization Code Exchange for a Desktop Callback

## Problem

A desktop finance application receives an OAuth authorization code on a loopback callback and must redeem it with the same redirect URI and PKCE verifier used for authorization. The form also needs the registered public `client_id` and exact OAuth wire names.

The example fixes the client registration in one business operation, validates the verifier syntax and exact callback string, and lets Defjs serialize and decode the token exchange.

## Scenario

Client `desktop-finance` redeems `desktop-code-1042` at `https://issuer.invalid/oauth/token`. It sends a 43-character verifier and the registered `http://127.0.0.1:4567/callback` URI in an URL-encoded form. A local issuer parses that form with `URLSearchParams` and returns a 600-second Bearer token.

The runner prints only registration, grant, callback, and token metadata. It does not print the authorization code, verifier, or access token, and it performs no external traffic.

## Approach

Bind the authorization code and PKCE verifier to the registered public client and exact loopback redirect, serialize the exchange as a form, and validate the returned token fields.

## Source map

- [`src/index.ts`](./src/index.ts): Token request contract, desktop code operation, local issuer, and runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-auth-oauth-code-exchange start
```

## Expected result

```text
{"clientId":"desktop-finance","expiresIn":600,"grantType":"authorization_code","redirectUri":"http://127.0.0.1:4567/callback","tokenType":"Bearer"}
```

The request fields come from the parsed URL-encoded body. `expiresIn` and `tokenType` come from the Struct-decoded token document.

## Key points

- Compare a fully registered redirect URI as an exact string.
- Send the original high-entropy PKCE verifier; challenge generation belongs to the earlier authorization step.
- Keep one-use codes, verifiers, and access tokens out of logs.

## Production notes

Replace `fixtureFetch` with the authorization server transport and derive the issuer from trusted client configuration. Generate a random verifier before authorization, send its S256 challenge, bind the callback to `state`, close the loopback listener promptly, and redeem the code once. Retain TLS verification for the token endpoint and store resulting credentials in platform-protected storage.

## Inspiration

- [RFC 6749, Authorization Code Token Request](https://www.rfc-editor.org/rfc/rfc6749.html#section-4.1.3) requires `grant_type=authorization_code`, the code, the same redirect URI when one was used, and the public `client_id` when the client is not authenticating. Defjs expresses those fields with `struct.urlencoded`.
- [RFC 6749, Redirect Endpoint Registration](https://www.rfc-editor.org/rfc/rfc6749.html#section-3.1.2.3) requires simple string comparison when a complete redirect URI is registered. The business operation applies that exact comparison.
- [RFC 7636, PKCE Code Verifier](https://www.rfc-editor.org/rfc/rfc7636.html#section-4.1) defines the verifier's 43-to-128-character unreserved syntax. The example validates and transmits that value.
- [AppAuth Android `AuthorizationService.performTokenRequest`](https://github.com/openid/AppAuth-Android/blob/e5f51842fd1d3c7e49d9b6642e346f43f495dac8/library/java/net/openid/appauth/AuthorizationService.java#L605-L645) is the retained official client reference for executing a token request and parsing its response.
- [AppAuth Android `TokenRequest`](https://github.com/openid/AppAuth-Android/blob/e5f51842fd1d3c7e49d9b6642e346f43f495dac8/library/java/net/openid/appauth/TokenRequest.java#L515-L533) is the retained official wire reference for adding authorization code, redirect URI, and code verifier parameters.

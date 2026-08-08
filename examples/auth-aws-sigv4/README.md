# AWS SigV4 for Daily Fulfillment Reports

## Problem

A fulfillment worker uploads a daily report through an AWS API Gateway endpoint. SigV4 covers the final method, URI, headers, body hash, service, region, and signing time, so signing a JavaScript object before Defjs serializes it can produce a different canonical request from the bytes actually sent.

The example adapts `aws4fetch` at the Fetch boundary, after Defjs has expanded the path and serialized the JSON body.

## Scenario

The worker sends `PUT https://reports.invalid/v1/reports/2025-02-28` with `{"completedOrders":128,"warehouse":"sea-1"}`. A transport adapter signs the native `Request` at `20250228T120000Z` for `execute-api` in `us-east-1` using fixed temporary credentials.

A local service removes the received Authorization header and independently asks `AwsV4Signer` to recompute it over the captured Request. Matching signatures return `204`; the runner prints the parsed credential scope and report but no access key, session token, or signature. No AWS or internet access is used.

## Approach

Serialize the report through Defjs, sign the final native `Request` at the transport boundary, and recompute the captured signature in the local fixture before accepting the upload.

## Source map

- [`src/index.ts`](./src/index.ts): Report contract, fulfillment operation, Fetch-boundary signer, and runner.
- [`src/fixture.ts`](./src/fixture.ts): Local service that recomputes the captured SigV4 Authorization header.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-auth-aws-sigv4 start
```

## Expected result

```text
{"credentialScope":"20250228/us-east-1/execute-api/aws4_request","report":{"completedOrders":128,"warehouse":"sea-1"},"status":204}
```

The credential scope comes from the signed Authorization header, `report` comes from the final request body, and `status: 204` means the local recomputation matched. It does not claim acceptance by AWS.

## Key points

- Place SigV4 after path expansion, header construction, and body serialization.
- Configure region and service explicitly for the target AWS API.
- Temporary credentials add a session-token header that participates in the signed Request.
- Keep credentials, signatures, and canonical requests containing sensitive headers out of logs.

## Production notes

Replace the fixture endpoint, credentials, and clock with the exact API Gateway origin, a short-lived role credential provider, and synchronized current UTC time. Read rotating credentials at dispatch, retain TLS verification, tightly control redirects, and apply service-specific retry guidance. Preserve application idempotency even though each retry receives a fresh signing time and signature.

## Inspiration

- [AWS IAM, Create a signed AWS API request](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html) defines the canonical request, credential scope, string-to-sign, signing key, and Authorization header. The example delegates those mechanics to `aws4fetch` after Defjs serialization.
- [`aws4fetch` signing implementation](https://github.com/mhart/aws4fetch/blob/f279a7ea80611b6f601617d7b3234054990165ae/src/main.js#L83-L123) is the retained authoritative library source for deriving the SigV4 credential key and signature. Defjs adapts it as an injected Fetch-boundary signer with explicit service and region.

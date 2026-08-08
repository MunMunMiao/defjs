# Expected HTTP Absence for Invoice PDFs

## Problem

An invoice-mail worker asks a document service for a PDF attachment. `404` means the document is not generated yet, and `410` means retention removed it; either is an expected no-attachment result. Treating every HTTP failure as absence would also hide operational failures.

The business rule maps only the declared `404` and `410` statuses to `null`. A validated `200` returns document text, and every other Defjs error is rethrown.

## Scenario

The local fixture returns `PDF for invoice 1042` for an available invoice and `404` for `invoice-pending`. The runner executes those two meaningful outcomes. The request definition and exported operation also admit `410` as the same expected-absence policy, but the fixture does not add a duplicate absence call.

## Approach

Declare available, `404`, and `410` responses explicitly, then map only the two declared runtime absence statuses to `null` while preserving Struct-decoded PDF text.

## Source map

- [`src/index.ts`](./src/index.ts): Request definition, exported absence policy, two-response Fetch fixture, and runner.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-http-expected-absence start
```

## Expected result

```text
{"available":"PDF for invoice 1042","pending":null}
```

The output demonstrates available content and one expected absence.

## Key points

- Expected absence is an explicit status allowlist.
- Grouping `404` and `410` avoids duplicate output declarations while preserving status checks.
- Returning `null` intentionally discards the pending-versus-expired distinction for this worker.

## Production notes

Use an appropriate binary response type for real PDFs and keep storage, quota, and network failures connected to operational handling rather than expanding the absence allowlist.

## Inspiration

- [RFC 9110, 404 Not Found](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.5) defines the semantics of a missing resource.
- [RFC 9110, 410 Gone](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.11) defines intentional, likely permanent unavailability.
- [Flora job runner](https://github.com/flora-pm/flora-server/blob/11a498290cfc37414b3ae5226a8289c6f7cb29a7/src/jobs-worker/FloraJobs/Runner.hs#L113-L144) treats selected missing-job outcomes as expected in a worker.

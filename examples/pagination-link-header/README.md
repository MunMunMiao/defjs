# Same-Origin HTTP Link Header Pagination

## Problem

A release manager lists open checkout issues from an API that advertises the next page in an HTTP `Link` header. Dispatching the advertised URI directly would let response metadata choose the next origin, path, and query.

The application must parse the header, accept the configured issue collection, copy only an advancing page number into a new typed request, and stop at 20 pages.

## Scenario

The local API serves `GET /repositories/checkout/issues?state=open&page=1&per_page=50`. Page one returns `CHK-17` and a `rel="next"` link to page two. Page two returns `CHK-23` without a Link header.

Execution uses an injected Fetch implementation at `https://issues.invalid`, so no advertised URI is sent directly to Fetch.

## Approach

Parse the `Link` header as untrusted metadata, admit only the configured origin and issue path, then rebuild the next request from allowlisted page parameters instead of dispatching the advertised URL.

## Source map

- [`src/index.ts`](./src/index.ts): Request definition, Link policy, exported paginator, local fixture, and runner.
- [`src/http-link-header.d.ts`](./src/http-link-header.d.ts): Minimal type declaration for the parser surface used by the example.

## Run

From the repository root, with workspace dependencies installed:

```sh
pnpm --silent --filter @defjs/example-pagination-link-header start
```

## Expected result

```text
{"issueIds":["CHK-17","CHK-23"]}
```

The two IDs show that the parsed Link advanced the fixed checkout collection from page one to page two.

## Key points

- Link syntax is parsed with `http-link-header`; routing authority stays with the application.
- Page size and filters are rebuilt from local policy rather than copied from response metadata.
- Monotonic page validation and the hard page cap both apply before another dispatch.

## Production notes

Keep authorization attached to the configured client endpoint, require HTTPS, tune the hard page cap, and add a separate retry budget.

## Inspiration

- [RFC 8288, Web Linking](https://www.rfc-editor.org/rfc/rfc8288.html) defines Link syntax, relation types, and target resolution.
- [go-github Link pagination parsing](https://github.com/google/go-github/blob/68ec62e4686eb89cd628c2f35f6808f4940fe1d8/github/github.go#L984-L1108) demonstrates deriving pagination metadata from response links.

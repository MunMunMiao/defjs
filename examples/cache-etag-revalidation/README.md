# ETag Revalidation for a Product Catalog

## Problem

A storefront repeatedly reads `SKU-482`. Downloading the unchanged representation wastes bandwidth, while a `304 Not Modified` response has no product body of its own.

The reader must retain the decoded product with its opaque ETag in a positive-capacity cache, send that value in `If-None-Match`, and use `304` only to select the retained representation.

## Scenario

The local catalog first returns `200` with the `Thermal Flask` body and ETag `"catalog-7"`. The second read sends `If-None-Match: "catalog-7"`; the fixture returns bodyless `304`, and the business reader returns the cached product.

## Approach

Keep each validated product body together with its ETag in a client-bound reader. A later read sends `If-None-Match` and treats `304` as control flow that selects the cached body.

## Source map

- [`src/index.ts`](./src/index.ts): Catalog request, revalidating reader, local fixture, and runner.

## Run

From the repository root:

```sh
pnpm --silent --filter @defjs/example-cache-etag-revalidation start
```

## Expected result

```text
{"name":"Thermal Flask","priceCents":3200,"sku":"SKU-482"}
```

The printed product is the cached representation returned after the second request receives `304`.

## Key points

- An ETag is opaque and is sent back unchanged, including its quotes.
- `304` is useful only when the client still owns the corresponding representation.
- New keys evict the oldest entry when the configured capacity is full; this is not a complete HTTP cache.

## Production notes

Partition cache keys by every representation dimension, obey `Cache-Control` and `Vary`, and bound storage according to product size and traffic. Decide explicitly whether failures may serve stale data.

## Inspiration

- [RFC 9110 section 8.8.3, ETag](https://www.rfc-editor.org/rfc/rfc9110.html#section-8.8.3) defines entity-tags as opaque validators.
- [RFC 9110 section 13.1.2, If-None-Match](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.2) and [section 15.4.5, 304 Not Modified](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.4.5) define conditional retrieval and bodyless revalidation.
- [PyGithub conditional object completion](https://github.com/PyGithub/PyGithub/blob/e36ffcbb02ed5584e0dc46307e9a98c3214d98a6/github/GithubObject.py#L699-L718) is the retained client reference for sending a saved ETag and retaining data on `304`.

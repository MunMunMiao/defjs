# HTTP JSON Merge Patch for Customer Contact Details

## Problem

A customer-care operation must remove an obsolete phone number and change a locale without overwriting a display name owned by another workflow. JSON Merge Patch distinguishes explicit `null` deletion from omitted members, and that meaning depends on `application/merge-patch+json`.

## Scenario

The fixture starts with customer `customer-1042`, display name `Mina Chen`, phone `+12025550142`, and locale `en-US`. The runner sends `{"phone":null,"locale":"fr-FR"}`; the fixture removes the phone, updates the locale, preserves the omitted display name, and returns the typed contact.

## Approach

Send only the intended patch members with `application/merge-patch+json`; the local server applies null deletion and omission preservation before Defjs validates the returned contact.

## Source map

- [`src/index.ts`](./src/index.ts): Merge Patch request definition, exported contact operation, local state fixture, and runnable demonstration.

## Run

```sh
pnpm --silent --filter @defjs/example-http-json-merge-patch start
```

Execution is deterministic, local, and exits after one fixture request.

## Expected result

```text
{"mediaType":"application/merge-patch+json","sentPatch":{"phone":null,"locale":"fr-FR"},"contact":{"customerId":"customer-1042","displayName":"Mina Chen","locale":"fr-FR"}}
```

The result has no `phone`, retains `displayName`, and shows the updated locale under the explicit Merge Patch media type.

## Inspiration

- [RFC 7396 section 2](https://www.rfc-editor.org/rfc/rfc7396.html#section-2) defines object-member replacement, null deletion, and preservation of absent members.
- [Kubernetes apimachinery patch types](https://github.com/kubernetes/apimachinery/blob/eed236ceee2c19c2753a3d93ac0631dc20750454/pkg/types/patch.go#L19-L30) treats `application/merge-patch+json` as a distinct patch type.

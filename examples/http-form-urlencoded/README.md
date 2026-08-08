# HTTP Form-Encoded Delivery Messages with Repeated Media

## Problem

A delivery worker must send a courier alert through a gateway that accepts `application/x-www-form-urlencoded` fields named `To`, `Body`, and repeated `MediaUrl`. Sending JSON or coercing the media list to one comma-separated string would violate that wire contract.

## Scenario

The runner sends `Gate 7 delivery is ready` to courier `+12025550142` with two proof-image URLs. A local Fetch fixture decodes the request with `URLSearchParams` and returns the typed message ID `message-1042`; no external traffic or credentials are involved.

## Approach

Build the provider form with its exact field aliases and repeated `MediaUrl` entries, let Defjs set the form media type, and parse the native body with `URLSearchParams` in the fixture.

## Source map

- [`src/index.ts`](./src/index.ts): Request definition, exported delivery operation, local form fixture, and runnable demonstration.

## Run

```sh
pnpm --silent --filter @defjs/example-http-form-urlencoded start
```

Execution is deterministic, local, and exits after one fixture request.

## Expected result

```text
{"messageId":"message-1042","contentType":"application/x-www-form-urlencoded;charset=UTF-8","to":"+12025550142","mediaUrls":["https://cdn.invalid/proof-front.jpg","https://cdn.invalid/proof-label.jpg"]}
```

The decoded `mediaUrls` remain two ordered `MediaUrl` fields, while `to` shows that the leading plus sign survived form encoding.

## Inspiration

- [WHATWG URL Standard: application/x-www-form-urlencoded](https://url.spec.whatwg.org/#application/x-www-form-urlencoded) defines serialization as an ordered list of name-value tuples.
- [Twilio PHP message creation](https://github.com/twilio/twilio-php/blob/af9017a0c1f0239603dd39da00c2e8f2deeffd5b/src/Twilio/Rest/Api/V2010/Account/MessageList.php#L66-L125) shows provider fields such as `To`, `Body`, and `MediaUrl` projected into a POST payload.

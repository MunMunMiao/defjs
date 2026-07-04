<p align="center">
  <a href="https://github.com/defjs/defjs" target="_blank" rel="noopener noreferrer">
    <img width="200" src="logo.jpg" alt="logo">
  </a>
</p>
<br/>
<p align="center">
  <a href="https://npmjs.com/package/@defjs/core"><img src="https://img.shields.io/npm/v/%40defjs%2Fcore?color=%23000&style=flat-square" alt="npm package"></a>
  <a href="https://npmjs.com/package/@defjs/core"><img src="https://img.shields.io/npm/dm/%40defjs%2Fcore?color=%23000&style=flat-square" alt="monthly downloads"></a>
  <a href="https://github.com/defjs/defjs/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/defjs/defjs/ci.yml?branch=main&color=%23000&style=flat-square" alt="build status"></a>
  <a href="https://github.com/defjs/defjs/blob/main/LICENSE"><img src="https://img.shields.io/github/license/defjs/defjs?color=%23000&style=flat-square" alt="license"></a>
  <a href="https://codecov.io/gh/defjs/defjs"><img src="https://img.shields.io/codecov/c/gh/defjs/defjs?color=%23000&style=flat-square" alt="codecov"/></a>
</p>
<br/>

## Introduction

`def` is an abbreviation for `define`, so it can be read as `define js`.

Defjs is a TypeScript library for defining typed HTTP, SSE, and WebSocket APIs and executing them across JavaScript runtimes.

- Typed HTTP, SSE, and WebSocket command definitions.
- Runtime validation and full TypeScript inference.
- Streaming support.
- Interceptor support.
- Works across browsers, Node.js, Bun, and Deno.
- ESM.

## Quick Start

The example below is for the current repository source/workspace API, not for the current latest npm release of `@defjs/core`.

Use these commands to install the workspace and verify the docs examples:

```sh
pnpm install
pnpm --dir doc run typecheck
```

To experiment with the snippet, paste it into a workspace package or docs twoslash block that resolves `@defjs/core` from repository source. The repository root itself is not an app package that imports `@defjs/core`.

If an external application installs `@defjs/core` from npm today, this sample may not apply until a published release explicitly includes this API. Use this sample for repository source/workspace onboarding only, and wait for a release whose package table below or release notes confirm that this API has shipped before using it in an external app.

```ts
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/users/:id',
  input: struct.request({
    path: struct.object({
      id: struct.number(),
    }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})

const [error, user] = await client.execute(getUser({ path: { id: 1 } }))
if (error) {
  console.error(error)
} else {
  console.log(user.name)
}
```

## Documentation

Documentation source lives in `doc/`. This README and the repository docs source now both target the current source/workspace API. This repository does not currently claim a live online documentation site; use the local preview commands below if you want to inspect the docs source.

> Note: some already-published npm package READMEs may lag behind this repository and may still mention an unavailable online site. Published npm users should check the repository package table and release notes before assuming the current source/workspace API has shipped in a public package.

- Primary repository onboarding: this root README and `doc/index.md` / `doc/guide/getting-started.md`
- Docs source directory: `doc/`
- Local preview of docs source: `pnpm --dir doc docs:dev`
- Local build of docs source: `pnpm --dir doc docs:build`
- Local preview of the built docs site: `pnpm --dir doc docs:preview`

## Repository packages

| Package | Purpose | Repository status | npm status |
| --- | --- | --- | --- |
| [`@defjs/core`](packages/core) | Typed HTTP, SSE, and WebSocket client definitions and execution. | Manifest version `0.4.0` in this repository. | Latest npm release: `0.3.3`. |
| [`@defjs/react`](packages/react) | React thin adapter for sharing a typed core client through `ClientProvider` and `useClient`. | Manifest version `0.0.1` in this repository. | No public npm package found. |
| [`@defjs/vue`](packages/vue) | Vue thin adapter for providing and injecting a typed core client. | Manifest version `0.0.1` in this repository. | No public npm package found. |
| [`@defjs/angular`](packages/angular) | Angular DI thin adapter for providing and injecting a typed core client. | Manifest version `19.0.0` in this repository. | Latest npm release: `18.0.7`, so the repository is ahead of npm. |
| [`@defjs/opentelemetry-server`](packages/opentelemetry-server) | Server-side outbound OpenTelemetry instrumentation for core clients. | Manifest version `0.2.0` in this repository. | No public npm package found. |

## Status and Roadmap

### Implemented in this repository source today

- Typed HTTP, SSE, and WebSocket command definitions in `@defjs/core`.
- Thin framework adapters for React, Vue, and Angular.
- Server-side outbound OpenTelemetry instrumentation for defjs clients.
- Documentation source and local VitePress tooling in `doc/`.

See the repository packages table above for current npm availability.

### Planned

- CLI tool.
- Generate API definitions from OpenAPI.
- Generate full SDK packages for larger API surfaces.

### Non-goals / boundaries

- Framework adapters are not query/cache/state libraries.
- OpenTelemetry integration does not initialize the OpenTelemetry SDK for you.
- Request/response bodies, full headers, raw query strings, and stream/message payloads are not captured by default.
- CLI and code generation are not delivered packages yet.

## Adoption note

Repository development baseline: Node `>=26`, `pnpm@11.6.0`, `engine-strict=true`.

These values describe this repository's contributor baseline, not a blanket requirement for every consumer application that installs a published package.

Most defjs packages are still evolving before stable 1.0; `@defjs/angular` follows Angular ecosystem versioning; overall API may evolve.

## License

[MIT](LICENSE)

## Reference

- [Angular HttpClient](https://angular.dev/guide/http)
- [Axios](https://axios-http.com)
- [Zod](https://zod.dev)
- [Deepkit Framework](https://github.com/deepkit/deepkit-framework)
- [tRPC](https://trpc.io)
- [Google API design guide](https://cloud.google.com/apis/design)
- [Tanstack Query](https://tanstack.com/query)
- [Rxjs](https://rxjs.dev)
- [Fetch-event-source](https://github.com/Azure/fetch-event-source)

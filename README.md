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

Defjs is a TypeScript library for defining typed request APIs and executing them across multiple transports and JavaScript runtimes.

- Typed request definitions for [Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API), custom transports, and more.
- Functional API.
- Streaming support.
- Full TypeScript inference.
- Works in any JavaScript runtime.
- Interceptor support.
- ESM.

## Quick Start

> Install with a package manager

```shell
npm install @defjs/core
// or
yarn install @defjs/core
// or
pnpm install @defjs/core
// or
bun install @defjs/core
```

> Use via CDN

**ES modules only**

```javascript
import {
  createClient,
  defineRequest,
  struct,
} from 'https://unpkg.com/@defjs/core/index.min.js';

/**
 * @title Step 1
 * @file src/main.ts
 * @description Set up a client
 */
const client = createClient({
  endpoint: 'https://example.com',
});

/**
 * @title Step 2
 * @file src/lib/api/user.ts
 * @description Define the request in the lib/api directory
 */
const useGetUser = defineRequest({
  method: 'GET',
  output: {
    200: struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
  },
  path: '/v1/user',
});

/**
 * @title Step 3
 * @file src/pages/home.ts
 * @description Use the defined request in business code
 */
const [error, user] = await client.execute(useGetUser());
if (error) {
  console.error(error);
}
console.log(user);
```

## Documentation

Visit [defjs.org](https://defjs.org) to get started.

## Packages

| Package                            | Version                                                                                         |
| ---------------------------------- | :---------------------------------------------------------------------------------------------- |
| [@defjs/core](packages/core)       | ![core version](https://img.shields.io/npm/v/%40defjs%2Fcore?color=%23000&style=flat-square)    |
| [@defjs/angular](packages/angular) | ![core version](https://img.shields.io/npm/v/%40defjs%2Fangular?color=%23000&style=flat-square) |

## Roadmap

- Documentation official website
- CLI Tool
  - Generate API from OpenAPI
  - Generate Full SDK Package (Like the [S3 SDK](https://www.npmjs.com/package/@aws-sdk/client-s3))
- Vue wrapper package
- React wrapper package

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

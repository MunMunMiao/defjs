---
title: 시작하기
description: Defjs를 설치하고 타입이 지정된 HTTP 엔드포인트를 정의해 애플리케이션에서 호출합니다.
---

# 시작하기

Defjs를 사용하면 애플리케이션이 호출할 API 계약을 한 번 정의하고 타입이 지정된 입력, 런타임 디코딩, 명확한 트랜스포트 결과와 함께 재사용할 수 있습니다.

## 설치

애플리케이션에 Core 패키지를 추가하세요.

```sh
pnpm add @defjs/core
```

프로젝트가 다른 패키지 관리자를 사용한다면 npm, Yarn, Bun의 같은 명령을 사용하세요. `@defjs/core`는 ESM입니다. Node.js에서 실행할 때 현재 패키지 metadata는 Node 22 이상을 요구합니다.

패키징된 ESM HTTP consumer는 Node.js 22, 24, 26, Bun 1.3.14, Deno 2.9.5에서 실행 검증했습니다. 애플리케이션을 컴파일한 뒤에는 다음 형태의 명령을 사용합니다.

```sh
node dist/index.js
bun run dist/index.js
deno run --node-modules-dir=manual --allow-net=api.example.com dist/index.js
```

Deno 명령은 `node_modules`에 이미 설치된 패키지를 사용합니다. 네트워크 권한은 애플리케이션에 필요한 정확한 API host로 바꾸세요. Bun과 Deno 검증은 문서화된 HTTP 범위만 다루며 모든 platform API나 transport를 보장하지 않습니다. 브라우저 build는 일반적인 bundler와 플랫폼에 필요한 Fetch 및 WebSocket 기능을 사용합니다.

runtime 간 테스트에서는 `error.kind`, `error.code`처럼 안정적인 Defjs 필드를 검증하세요. 엔진별 native `Error` 메시지나 JSON parse 문구에 의존하지 마세요. Node.js, Bun, Deno는 이런 세부 정보를 서로 다르게 표시할 수 있습니다.

애플리케이션에 필요한 adapter만 추가하세요.

| 구성               | 패키지                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------- |
| React 18+          | `@defjs/core`, `@defjs/react`, `react`                                                    |
| Vue 3+             | `@defjs/core`, `@defjs/vue`, `vue`                                                        |
| 서버 OpenTelemetry | `@defjs/core`, `@defjs/opentelemetry-server`, `@opentelemetry/api`, `@opentelemetry/core` |

::: tip 설치한 버전에 맞는 문서를 사용하세요
이 페이지는 현재 문서 버전의 API를 설명합니다. 애플리케이션에 설치된 버전을 확인하세요. export나 option이 다르다면 여러 버전의 예제를 섞지 말고 해당 버전의 문서와 릴리스 노트를 사용하세요.
:::

## 첫 요청 정의

API가 `GET /users/:id`를 제공한다고 가정합니다. base URL과 response Struct를 실제 서비스 계약에 맞게 바꾸세요.

```typescript
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ],
})

async function loadUser(id: number) {
  const [error, user, response] = await client.execute(getUser({ path: { id } }))

  if (error) {
    console.error(error.kind, error.code)
    return
  }

  console.log(user.name, response.status)
}

void loadUser(7)
```

`defineRequest(...)`는 **커맨드 빌더**를 반환합니다. `getUser(...)`를 호출하면 엔드포인트 정의와 호출 입력을 담은 **커맨드**가 만들어집니다. 이어서 `client.execute(...)`는 다음 HTTP 3요소 튜플을 반환합니다.

```typescript
;[error, result, response]
```

성공하면 `error`는 `null`, `result`는 디코딩된 출력 데이터, `response`는 Defjs `HttpResponse` 래퍼입니다. 실패하면 `result`는 `undefined`입니다. 응답을 받지 못한 실패에서는 응답 래퍼도 `undefined`입니다.

### 상태 리터럴은 자동으로 보존됩니다

`defineRequest(...)`는 `output`에 const generic을 사용하므로 inline 배열 항목과 그룹화한 상태 배열의 리터럴 값이 자동으로 유지됩니다. 추론된 2xx 성공 body와 비-2xx 오류 body를 구분하기 위해 `as const`를 붙일 필요가 없습니다.

객체 형식 output도 지원합니다.

```typescript
const output = {
  '200': struct.object({ id: struct.number() }),
  '404': struct.object({ message: struct.string() }),
}
```

## 애플리케이션에 적용

엔드포인트 정의는 서비스 API를 설명하는 모듈에 두세요. 컴포넌트, route handler, job, store에서 커맨드 빌더를 재사용합니다. endpoint, credential, interceptor, 생명주기를 소유하는 경계에서 클라이언트를 만드세요.

- 브라우저 애플리케이션은 보통 클라이언트 하나를 공유할 수 있습니다.
- 서버 렌더링에서는 header, cookie, 사용자, tenant가 요청마다 다르면 요청 범위 클라이언트를 만드세요.
- SSE나 WebSocket 리소스를 여는 코드는 해당 리소스를 소비하고 닫는 일도 맡아야 합니다.

## 다음 단계

- [커맨드](/ko-KR/core/commands)에서는 자동 요청 매핑과 사용자 정의 스키마 결합 프로젝션을 설명합니다.
- [오류](/ko-KR/core/errors)에서는 세 트랜스포트의 튜플과 `RequestError` union을 설명합니다.
- [HTTP](/ko-KR/core/http)에서는 URL 해석, 요청 body, 출력 디코딩, 취소, XSRF 동작을 설명합니다.
- [예제](/ko-KR/guide/examples)에서는 이 계약들을 애플리케이션이 소유하는 사용 패턴으로 조합합니다.

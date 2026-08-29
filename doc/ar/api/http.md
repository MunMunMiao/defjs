---
title: HTTP
description: defineRequest، خيارات التنفيذ، وأنواع طلب/استجابة HTTP.
---

# HTTP

أعلن طلبًا مُنوَّعًا، ابنِ أمرًا من المدخل، نفّذه.

## defineRequest() {#defineRequest}

```ts
function defineRequest(definition: RequestDefinition): RequestCommandBuilder
```

- **definition** — `method`، `path`، struct `input` اختياري، `output` بمفتاح الحالة، و`operation` و`build` اختياريان.
- **يُرجع** منشئًا. استدعِه بالمدخل لتحصل على `HttpCommand`.

```ts
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
  },
})
```

`output` يمكن أن يكون أيضًا قائمة مجموعات `{ status, body }` (struct جسم واحد لعدة رموز).

## executeHttpCommand() {#executeHttpCommand}

```ts
function executeHttpCommand(clientConfig: ClientConfig, command: HttpCommand, options?: HttpExecuteOptions): Promise<HttpAwaitResult>
```

مدخل منخفض المستوى يستخدمه `client.execute`. شيفرة التطبيق تستدعي `client.execute(command, options)`.

- **يُرجع** `[null, body, response]` أو `[error, undefined, response?]`.

## fetchHandler() {#fetchHandler}

```ts
function fetchHandler(httpRequest: HttpRequest, fetchImpl?: typeof fetch): Promise<HttpResponse<unknown>>
```

نقل HTTP الافتراضي. يُستخدم ما لم يستبدله `withHTTPHandle`.

## makeResponse() {#makeResponse}

```ts
function makeResponse<R>(options?: MakeResponseOptions<R>): HttpResponse<R>
```

ابنِ `HttpResponse` دون استدعاء شبكة (معترضات، اختبارات). الحالة الافتراضية `0`. `ok` صحيح لـ 2xx.

## خيارات التنفيذ

## HttpExecuteOptions {#HttpExecuteOptions}

```ts
type HttpExecuteOptions = {
  onDownloadProgress?: HttpProgressFn
  onUploadProgress?: HttpProgressFn
  abort?: AbortSignal
  timeout?: number
  signal?: AbortSignal
}
```

الإلغاء هو `abort` **أو** `timeout`، لا كلاهما. `signal` يُجمَع مع أيٍّ منهما وليس اسمًا بديلًا لـ `abort`. الأشكال الصالحة: `{ timeout }`، `{ abort }`، `{ signal, timeout }`، `{ signal, abort }`. غير صالح: `{ abort, timeout }`. يجب أن يكون `timeout` عددًا صحيحًا آمنًا موجبًا في `1..2_147_483_647`.

## الأنواع

### RequestDefinition {#RequestDefinition}

`method`، `path`، `input` اختياري، `output`، `responseType` (`'json' | 'text' | 'blob' | 'arraybuffer'`)، `operation`، `build` اختياري (تجميع طلب مخصص؛ يتطلّب `input`).

### RequestOutputShape {#RequestOutputShape}

```ts
type RequestOutputShape = { [status: number]: AnyStruct } | readonly { status: number | readonly number[]; body: AnyStruct }[]
```

### HttpAwaitResult {#HttpAwaitResult}

```ts
type HttpAwaitResult<TSuccess, TErrorData> =
  | [error: null, result: TSuccess, response: HttpResponse<TSuccess>]
  | [error: RequestError<TErrorData>, result: undefined, response: HttpResponse<unknown> | undefined]
```

### HttpRequest {#HttpRequest}

طلب صادر موحّد: `method`، `endpoint`، `headers`، `body`، `abort`، `operation`، خطافات التقدم، `baseEndpoint`، بيانات تعريف الاستعلام.

### HttpResponse {#HttpResponse}

```ts
type HttpResponse<R> = {
  readonly url: string
  readonly status: number
  readonly statusText: string
  readonly headers: Headers
  readonly body: R | null
  readonly error?: unknown
  readonly ok: boolean
}
```

### HttpProgressEvent {#HttpProgressEvent}

### HttpProgressFn {#HttpProgressFn}

`loaded`، `total`، `lengthComputable`. ردود النداء يمكن أن تكون غير متزامنة.

انظر [دليل HTTP](../core/http.md) و[الأوامر](../core/commands.md).

## ResponseGroupItem {#ResponseGroupItem}

صف `{ status, body }` في الشكل القائمي لـ `RequestOutputShape`. `status` قد يكون رمزًا واحدًا أو عدة رموز تشترك في نفس body struct.

## RequestCommandBuilder {#RequestCommandBuilder}

يعيده `defineRequest`. استدعه بالمدخل لتحصل على `HttpCommand`.

## HttpCommand {#HttpCommand}

أمر معتم من باني الطلب. مرّره إلى `client.execute`.

## UseRequestConfig {#UseRequestConfig}

حقول التقدّم والإلغاء. `HttpExecuteOptions` يضيف `signal`.

## RequestSuccessData {#RequestSuccessData}

جسم النجاح المستنتج من إدخالات `output` ذات 2xx المعلنة.

## RequestErrorData {#RequestErrorData}

جسم الخطأ المستنتج من إدخالات `output` غير 2xx المعلنة.

## HttpResponseType {#HttpResponseType}

`'arraybuffer' | 'blob' | 'json' | 'text'`

## MakeResponseOptions {#MakeResponseOptions}

حقول `makeResponse`: `status`، `statusText`، `url`، `headers`، `body`، `error`.

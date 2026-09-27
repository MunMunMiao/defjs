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

- **definition** — `method` و`path`، و`input` struct اختياري، و`output` و`error` structs اختياريان، و`operation` و`build` اختياريان.
- **يُرجع** منشئًا. استدعِه بالمدخل لتحصل على `HttpCommand`.

```ts
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: struct.object({ id: struct.number(), name: struct.string() }),
  error: struct.object({ message: struct.string() }),
})
```

`output` هو struct واحد لجسم 2xx؛ و`error` هو struct واحد لكل جسم غير-2xx. ولا يُفهرَس أيٌّ منهما بالحالة. وحذف أحدهما يعني أن ذلك الجسم لا يُقرأ أبدًا — راجع [الإعلان هو تأكيد](/ar/guide/design-decisions#الإعلان-هو-تأكيد).

## executeHttpCommand() {#executeHttpCommand}

```ts
function executeHttpCommand(clientConfig: ClientConfig, command: HttpCommand, options?: HttpExecuteOptions): Promise<HttpAwaitResult>
```

مدخل منخفض المستوى يستخدمه `client.execute`. شيفرة التطبيق تستدعي `client.execute(command, options)`.

- **يُعيد** `[null, data, response]` أو `[fault, undefined, undefined]`.

الحالة غير-2xx هي دائمًا `HTTP_STATUS`. و`data` فيها هو جسم `error` المفكوك إن كان معلَنًا، و`undefined` فيما عدا ذلك. وعند الفشل يكون العنصر الثالث في الصفيف `undefined`؛ إذ يحمل الخطأ بيانات الاستجابة الوصفية.

## fetchHandler() {#fetchHandler}

```ts
function fetchHandler(httpRequest: HttpRequest, fetchImpl?: typeof fetch): Promise<HttpResponse<unknown>>
```

نقل HTTP الافتراضي. يُستخدم ما لم يستبدله `withHTTPHandle`. وهو يرفض — بدل أن يستقر باستجابة مُصطنعة — حين لا تصل أي استجابة إلى العميل.

## makeResponse() {#makeResponse}

```ts
function makeResponse<R>(options?: MakeResponseOptions<R>): HttpResponse<R>
```

ابنِ `HttpResponse` دون استدعاء شبكة (معترضات، اختبارات). الحالة الافتراضية `0`. `ok` صحيح لـ 2xx. والقيمة التي يُعيدها تمرّ بنفس فحص نوع الوسائط ونفس الـ struct المعلَن كأي استجابة قادمة من الشبكة؛ فلا يوجد مسار قصير قائم على الثقة.

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

`method` و`path`، و`input` و`output` و`error` و`responseType` (`'json' | 'text' | 'blob' | 'arraybuffer'`) و`operation` اختيارية، و`build` اختياري (تبني الطلب بنفسك؛ يحتاج `input`).

### ResponseDeclaration {#ResponseDeclaration}

```ts
type ResponseDeclaration<TOutput, TError> = { output?: TOutput; error?: TError }
```

نصف `output` / `error` من `RequestDefinition`. وإن غاب الاثنان رُفض `responseType` أيضًا: فلا شيء يُفكّ، ولا شيء يختاره.

### HttpAwaitResult {#HttpAwaitResult}

```ts
type HttpAwaitResult<TData = undefined, TErrorData = undefined> =
  | [error: null, result: TData, response: [TData] extends [undefined] ? HttpMeta : DecodedResponse<TData>]
  | [error: FaultOf<TErrorData>, result: undefined, response: undefined]
```

عند النجاح لا يحمل العنصر الثالث `body` إلا إذا كان `output` معلَنًا. وعند الفشل يكون `undefined` — فالخطأ يحمل أصلًا ما وُجد من بيانات الاستجابة الوصفية.

### HttpRequest {#HttpRequest}

طلب صادر موحّد: `method`، `endpoint`، `headers`، `body`، `abort`، `operation`، خطافات التقدم، `baseEndpoint`، بيانات تعريف الاستعلام.

### HttpMeta {#HttpMeta}

```ts
type HttpMeta = {
  readonly headers: Headers
  readonly ok: boolean
  readonly status: number
  readonly statusText: string
  readonly url: string
}
```

بيانات وصفية للاستجابة، متاحة كلما وصلت استجابة إلى العميل. وهي **لا** تحمل `body`: فالجسم لا يوجد إلا بعد أن يفكّه struct معلَن.

### DecodedResponse {#DecodedResponse}

```ts
type DecodedResponse<TBody> = HttpMeta & { readonly body: TBody }
```

استجابة فُكّ جسمها بنجاح مقابل الـ struct المعلَن. وامتلاك هذا النوع هو نفسه الدليل على أن الفكّ قد حدث، ولذلك يُبلِّغ فشل الفكّ عن `HttpMeta` وحده.

### HttpResponse {#HttpResponse}

```ts
type HttpResponse<R> = {
  readonly url: string
  readonly status: number
  readonly statusText: string
  readonly headers: Headers
  readonly body: R | null
  readonly ok: boolean
}
```

هذا شكل الشبكة الذي تنتجه وسائل النقل ويراه المعترضون: `body` نصٌّ أو JSON مُحلَّل مسبقًا، لا قيمة مفكوكة. والذي يصل المستدعي هو `DecodedResponse`.

### HttpProgressEvent {#HttpProgressEvent}

### HttpProgressFn {#HttpProgressFn}

`loaded`، `total`، `lengthComputable`. ردود النداء يمكن أن تكون غير متزامنة.

انظر [دليل HTTP](../core/http.md) و[الأوامر](../core/commands.md). والاستدعاء الذي يرمي هو `EXT_OBSERVER_FAILED`.

## RequestCommandBuilder {#RequestCommandBuilder}

يعيده `defineRequest`. استدعه بالمدخل لتحصل على `HttpCommand`.

## HttpCommand {#HttpCommand}

أمر معتم من باني الطلب. مرّره إلى `client.execute`.

## UseRequestConfig {#UseRequestConfig}

حقول التقدّم والإلغاء. `HttpExecuteOptions` يضيف `signal`.

## RequestSuccessData {#RequestSuccessData}

جسم النجاح المستنتج من `output` struct المعلَن، أو `undefined` إن لم يُعلن أيّ منه.

## RequestErrorData {#RequestErrorData}

جسم الخطأ المستنتج من `error` struct المعلَن، أو `undefined` إن لم يُعلن أيّ منه.

## HttpResponseType {#HttpResponseType}

`'arraybuffer' | 'blob' | 'json' | 'text'`

## MakeResponseOptions {#MakeResponseOptions}

حقول `makeResponse`: `status`، `statusText`، `url`، `headers`، `body`، `request`.

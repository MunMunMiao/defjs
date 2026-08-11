---
title: Struct
description: صف فك الترميز البنيوي الصارم والمدخلات المطلوبة والاختيارية وaliases والتعامل مع StructError.
---

# Struct

تصف Structs فك الترميز البنيوي الصارم والترميز إلى wire. تفشل القيم المطلوبة المفقودة والقيم غير الصالحة بدل إنشاء قيم افتراضية.

استخدم واجهة `struct` و`Infer<T>` من root entry:

```typescript
import { struct, type Infer, type StructInput } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  active: struct.boolean(),
})

type User = Infer<typeof User>
// { id: number; name: string; active: boolean }
```

## Constructors

تشمل constructors الشائعة:

```typescript
struct.string()
struct.number()
struct.boolean()
struct.bigint()
struct.date()
struct.null()
struct.literal('ready')
struct.enum(['pending', 'done'])
struct.array(struct.string())
struct.tuple([struct.string(), struct.number()])
struct.object({ id: struct.number() })
struct.record(struct.number())
struct.or(struct.string(), struct.number())
struct.intersection(struct.object({ id: struct.number() }), struct.object({ name: struct.string() }))
struct.discriminatedUnion('kind', [
  struct.object({ kind: struct.literal('click'), x: struct.number() }),
  struct.object({ kind: struct.literal('key'), key: struct.string() }),
])
```

تقبل `struct.any()` و`struct.unknown()` أي قيمة غير `null` أو `undefined`؛ استخدم modifiers نفسها للسماح بهما. أما binary constructors فهي `struct.blob()` و`struct.file()` و`struct.arrayBuffer()`.

يدعم كل Struct هذه modifiers:

```typescript
struct.string().optional()
struct.string().null()
struct.string().nullish()
struct.string().alias('wire_name')
```

## التحليل الصارم

استخدم `struct.parse(schema, input)` لفك القيمة خارج command. يعيد tuple ثابتًا يبدأ بالخطأ:

```typescript
const Profile = struct.object({
  name: struct.string(),
  nickname: struct.string().optional(),
  biography: struct.string().null(),
  note: struct.string().nullish(),
})

const [error, profile] = struct.parse(Profile, input)

if (error) {
  // profile is undefined
  return
}
```

```typescript
type ParseResult<T> = [error: null, value: T] | [error: StructError, value: undefined]
```

ينطبق عقد modifier واحد: القيمة المفقودة أو `undefined` لا تُقبل إلا مع `.optional()` أو `.nullish()`؛ ولا يُقبل `null` الصريح إلا مع `.null()` أو `.nullish()`. ولا تجعل `.null()` القيمة اختيارية.

تُحذف حقول object المفقودة من نوع optional أو nullish من output؛ وعلى المستوى الأعلى تُفك إلى `undefined`. تُسقط مفاتيح object غير المعروفة، وتستخدم مخرجات object وrecord prototype مساويًا لـ null.

تقارن المساواة العميقة الصارمة في Node الـ prototype أيضًا، لذلك لا يتساوى object حلله Struct بعمق مع object literal يملك الحقول نفسها. اختبر هذا الحد صراحة أو أنشئ shallow copy داخل assertion فقط:

```typescript
import assert from 'node:assert/strict'

const [error, profile] = struct.parse(struct.object({ name: struct.string() }), { name: 'Ada' })
assert.equal(error, null)
assert.equal(Object.getPrototypeOf(profile), null)
assert.deepEqual({ ...profile }, { name: 'Ada' })
```

ينشئ spread هنا نسخة سطحية خاصة بهذا assertion. وتظل كائنات Struct المتداخلة ذات prototype مساويًا لـ null. لا تضف normalization أو clone عامًا إلى مسار production لمجرد إرضاء test matcher.

عند تفعيل `exactOptionalPropertyTypes`، تستخدم مدخلات object المستنتجة خصائص optional دقيقة. احذف المفتاح optional أو nullish بدل إسناد `undefined` إليه:

```typescript
const OptionalProfile = struct.object({
  nickname: struct.string().optional(),
})

type OptionalProfileInput = StructInput<typeof OptionalProfile>

const omitted: OptionalProfileInput = {}
// @ts-expect-error With exactOptionalPropertyTypes, omit optional keys instead.
const explicitUndefined: OptionalProfileInput = { nickname: undefined }
```

في runtime، يقبل `struct.parse` بصورة دفاعية قيمة `undefined` صريحة من input مجهول ويحذف المفتاح. ولا توسّع هذه normalization نوع input المستنتج ساكنًا للمنادي.

## مدخلات Object وRequest المطلوبة

تكون خصائص object مطلوبة في TypeScript وruntime ما لم تكن optional أو nullish. وكل section معلن داخل `struct.request(...)` مطلوب أيضًا؛ أما الأقسام غير المعلنة فلا تظهر في input type.

```typescript
const Input = struct.request({
  path: struct.object({ id: struct.string() }),
  query: struct.object({ page: struct.number().optional() }),
})

// { path: { id: string }; query: { page?: number } }
```

حذف `query` خطأ، بينما `query: {}` صالح. أي حقل مطلوب مفقود أو `undefined` صريح أو `null` ممنوع أو نوع خاطئ يفشل التحليل كله ولا يعيد قيمة جزئية.

تتوقف Structs المركبة عند أول issue محدد. ويجب أن يطابق طول tuple الطول المعلن تمامًا. يظل `struct.or(...)` يجرب البدائل بالترتيب، ويظل `struct.discriminatedUnion(...)` يختار الفرع المعلن.

عندما تستخدم حقول discriminator أسماء alias، يقرأ `struct.discriminatedUnion(...)` أول wire discriminator موجود فعليًا وفق ترتيب إعلان options. وبعد اختيار الفرع لا يقرأ أي alias تابع لـ option لاحق.

تفرض Structs الشكل المعلن، لا قواعد التطبيق الخاصة بـ authorization أو range أو amount أو format أو state transition. ولا توجد DSL عامة لـ refine/range/format.

تقبل `struct.number()` قيمتي `Infinity` الموجبة والسالبة؛ وهي تستبعد `NaN` فقط من أعداد JavaScript. طبّق فحوص finite وrange وdomain في كود التطبيق قبل إنشاء الأمر. لا تضع هذه الفحوص في `build`، لأن `build` تستقبل إسقاطًا مرتبطًا بالـ Struct لا قيم المستدعي وقت التشغيل.

## أجسام الطلب

تجمع `struct.request(...)` أقسام wire المباشرة:

```typescript
const input = struct.request({
  path: struct.object({ organizationId: struct.string() }),
  query: struct.object({ includeDisabled: struct.boolean().optional() }),
  headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
  body: struct.json(
    struct.object({
      displayName: struct.string().alias('display_name'),
    }),
  ),
})
```

حدود body هي:

| Struct                     | الترميز           |
| -------------------------- | ----------------- |
| `struct.json(inner)`       | JSON              |
| `struct.text()`            | نص عادي           |
| `struct.urlencoded(shape)` | `URLSearchParams` |
| `struct.formData(shape)`   | `FormData`        |
| `struct.blob()`            | `Blob`            |
| `struct.arrayBuffer()`     | `ArrayBuffer`     |

راجع [الأوامر](/ar/core/commands) للربط التلقائي للطلب وقيود وسائل النقل.

## Aliases

تغيّر `.alias(name)` مفتاح wire من دون تغيير مفتاح TypeScript المنطقي.

```typescript
const UserBody = struct.object({
  id: struct.number().alias('user_id'),
  displayName: struct.string().alias('display_name'),
})

const [logicalError, logicalUser] = struct.parse(UserBody, { id: 1, displayName: 'Ada' })
if (logicalError) throw logicalError

const [wireKeyError] = struct.parse(UserBody, { user_id: 1, display_name: 'Ada' })
if (!wireKeyError) throw new Error('struct.parse must read logical keys')
```

يستخدم `logicalUser` المفاتيح `{ id, displayName }`، بينما يشير `wireKeyError` إلى غياب المفتاح المنطقي `id`. يقرأ `struct.parse` العام القيم المنطقية فقط، ولا يعامل مفاتيح wire كمدخل مستقل.

يُطبّق alias الخاص بالـ wire عند ترميز JSON وفكّه داخل transport:

```typescript
import { createClient, defineRequest, withEndpoint, withHTTPHandle } from '@defjs/core'

let requestWireBody: unknown
const echoUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.request({ body: struct.json(UserBody) }),
  output: { 200: UserBody },
})
const client = createClient(
  withEndpoint('https://example.test'),
  withHTTPHandle(async (input, init) => {
    requestWireBody = await new Request(input, init).json()
    return Response.json({ user_id: 1, display_name: 'Ada' })
  }),
)

const [requestError, responseUser] = await client.execute(echoUser({ body: { id: 1, displayName: 'Ada' } }))
if (requestError) throw requestError
```

يكون `requestWireBody` هو `{ user_id, display_name }`، بينما يعود `responseUser` إلى `{ id, displayName }`. ويستخدم بناء الطلب التلقائي aliases أيضًا لمفاتيح path وquery وheader وURL-encoded وmultipart الصادرة. أما target keys الصريحة في إسقاط `build` مخصص فتبقى كما هي.

## `StructError`

ينتج فشل فك الترميز البنيوي `StructError`، ويظهر غالبًا داخل `RequestError.cause`.

```typescript
import { StructError, type RequestError, type StructIssue } from '@defjs/core'

export function structIssues(error: RequestError): readonly StructIssue[] {
  if (error.kind === 'definition' && error.cause instanceof StructError) {
    return error.cause.issues
  }
  return []
}
```

يعرض `StructError` ما يلي:

- `issues`، وهي مصفوفة `StructIssue[]` الأصلية؛
- `format()`، وهي شجرة رسائل متداخلة؛
- `flatten()`، وهي رسائل form وfields على المستوى الأعلى؛
- `prettify()`، وهي string متعددة الأسطر ومقروءة.

قد يحتوي `StructIssue.received` على بيانات input أو response. وقد تتضمن الرسائل الافتراضية تمثيلًا لتلك القيمة. كما قد تأتي paths والمفاتيح المنسقة من بيانات غير موثوقة، خصوصًا في records. نقّح أو راجع `issues` والرسائل و`format()` و`flatten()` و`prettify()` قبل تسجيلها أو إعادتها.

## رسائل الأخطاء العامة

تستبدل `setErrorMap(...)` توليد الرسائل على مستوى العملية:

```typescript
import { setErrorMap } from '@defjs/core'

setErrorMap((issue) => {
  if (issue.code === 'invalid_type') {
    return `Invalid value at ${issue.path.join('.')}`
  }
  return undefined
})
```

هذه الخريطة عامة وليست ضمن نطاق العميل. يؤثر تغييرها على Struct issues اللاحقة في كل عميل داخل JavaScript realm نفسها. تجنب الحالة الخاصة بالطلب داخل callback، ونسّق تثبيتها في التطبيقات التي تشارك عملية واحدة.

## التالي

- تربط [الأوامر](/ar/core/commands) حقول Struct بالطلبات والرسائل.
- تشرح [الأخطاء](/ar/core/errors) كيف تظهر إخفاقات Struct في execution tuples.
- تغطي [HTTP](/ar/core/http) فك ترميز response وأخطاء تمثيل body.

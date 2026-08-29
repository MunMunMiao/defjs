---
title: Struct
description: نمذج أشكال الطلب والاستجابة، حلّل المجهول، ورمّز أجسام السلك.
---

# Struct

نمذج طلبًا (واستجاباته) كـ Structs. تحصل على أنواع TypeScript عبر `Infer`، وفحوص وقت التشغيل عبر `struct.parse(...)` — بلا رمي، tuple يضع الخطأ أولاً.

## الإعداد الأساسي

```typescript twoslash
import { defineRequest, struct, type Infer } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  active: struct.boolean(),
})

type User = Infer<typeof User>

const createUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.request({
    body: struct.json(
      struct.object({
        name: struct.string(),
        email: struct.string(),
      }),
    ),
  }),
  output: { 201: User },
})

const [parseError, user] = struct.parse(User, { id: 7, name: 'Ada', active: true })
if (!parseError) console.log(user.name)
void createUser
```

المخرج المحلَّل يحتفظ فقط بالحقول المعلَنة. حقول مطلوبة مفقودة، أو بدائيات خاطئة، أو قيم متداخلة سيئة، أو طول tuple خاطئ، أو `null` غير مسموح → `StructError`، بلا قيمة جزئية. Structs غير قابلة للتغيير؛ `.optional()` وأصدقاؤها تُرجع Struct جديدًا.

## مطلوب، اختياري، null

الوجود والقابلية لـ null منفصلان:

| الإعلان                      | مفقود / `undefined`          | `null` | قيمة صالحة      |
| ---------------------------- | ---------------------------- | ------ | --------------- |
| `struct.string()`            | ارفض                         | ارفض   | اقبل سلسلة      |
| `struct.string().optional()` | اقبل؛ احذف حقل الكائن الغائب | ارفض   | اقبل سلسلة      |
| `struct.string().null()`     | ارفض                         | اقبل   | اقبل سلسلة      |
| `struct.string().nullish()`  | اقبل؛ احذف حقل الكائن الغائب | اقبل   | اقبل سلسلة      |
| `struct.null()`              | ارفض                         | اقبل   | ارفض قيمًا أخرى |

```typescript twoslash
import { struct } from '@defjs/core'

const Profile = struct.object({
  name: struct.string(),
  nickname: struct.string().optional(),
  biography: struct.string().null(),
  note: struct.string().nullish(),
})

const [error, profile] = struct.parse(Profile, {
  name: 'Ada',
  biography: null,
  note: undefined,
})
if (error) throw error
console.log(profile.name, profile.nickname, profile.biography, profile.note)
```

في الجذر، الاختياري يمكن أن يكون `undefined`. داخل كائن، الحقول الاختيارية/nullish المحذوفة تبقى غائبة. في `struct.request(...)`، قسم كله اختياري يمكن حذفه (يُطبَّع إلى `{}`)؛ قسم بحقل مطلوب يبقى مطلوبًا. وجود غلاف جسم → الجسم مطلوب، حتى لو كانت الحقول الداخلية اختيارية.

## أغلفة جسم الطلب

`struct.request(...)` يقسم `path` و`query` و`headers` و`body`. الأجسام تحتاج ترميزًا صريحًا:

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const createUser = defineRequest({
  method: 'POST',
  path: '/organizations/:organizationId/users',
  input: struct.request({
    path: struct.object({ organizationId: struct.string() }),
    query: struct.object({ notify: struct.boolean().optional() }),
    headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
})

const command = createUser({
  path: { organizationId: 'acme' },
  query: { notify: true },
  headers: { requestId: 'request-42' },
  body: { displayName: 'Ada' },
})
void command
```

| الغلاف                     | القيمة المحلَّلة | حد السلك                                                             |
| -------------------------- | ---------------- | -------------------------------------------------------------------- |
| `struct.json(inner)`       | قيمة من `inner`  | نص JSON، `application/json`                                          |
| `struct.text()`            | `string`         | نص، `text/plain;charset=UTF-8`                                       |
| `struct.urlencoded(shape)` | كائن الشكل       | `URLSearchParams`، `application/x-www-form-urlencoded;charset=UTF-8` |
| `struct.formData(shape)`   | كائن الشكل       | `FormData`؛ المنصة تضبط حد multipart                                 |
| `struct.blob()`            | `Blob`           | نوع Blob أو `application/octet-stream`                               |
| `struct.file()`            | `File`           | `File` أصلي (اسم + نوع)                                              |
| `struct.arrayBuffer()`     | `ArrayBuffer`    | مخزن، `application/octet-stream`                                     |

`struct.file()` هو Struct قيمة لحقول النموذج — وليس `request.body` مستقلًا. الأجسام الثنائية هي `struct.blob()` و`struct.arrayBuffer()`. Structs الكائن/المصفوفة/البدائي العارية ليست صالحة كـ `request.body`. SSE ترفض `body`. مدخل طلب WebSocket يرفض `body` و`headers`.

## الأسماء المستعارة

`.alias(...)` يفصل الأسماء المنطقية عن أسماء السلك. `struct.parse(...)` يستخدم المفاتيح المنطقية. ترميزات JSON وطلب مسطح ترمّز الأسماء المستعارة؛ فك استجابة JSON يعيّن مفاتيح السلك إلى الحقول المنطقية.

```typescript twoslash
import { struct } from '@defjs/core'

const User = struct.object({
  displayName: struct.string().alias('display_name'),
})

const [parseError, user] = struct.parse(User, { displayName: 'Ada' })
if (parseError) throw parseError
console.log(user.displayName)

const [wireError] = struct.parse(User, { display_name: 'Ada' })
console.log(wireError?.issues[0]?.path)
```

| الحد                                       | الحقل                     |
| ------------------------------------------ | ------------------------- |
| `struct.parse(User, ...)`                  | منطقي `displayName`       |
| ترميز طلب JSON                             | سلك `display_name`        |
| فك استجابة JSON                            | سلك → منطقي `displayName` |
| ترميز استعلام، رأس، URL-encoded، multipart | الاسم المستعار كمفتاح     |

الأسماء المستعارة تعمل على الحقول المتداخلة والمصفوفات والكائنات والاتحادات والمميّزات. أبقِ الأسماء المنطقية في كود التطبيق؛ ضع التسمية الخارجية في الـ Struct.

## أعطال التحليل

`struct.parse(...)` يُرجع `[null, value]` أو `[StructError, undefined]`. `StructError` يمتد من `Error` ويعرض `issues`، مع `format()` و`flatten()` و`prettify()`.

```typescript twoslash
import { struct, StructError } from '@defjs/core'

const User = struct.object({ id: struct.number(), name: struct.string() })
const [error, value] = struct.parse(User, { id: 'not-a-number' })

if (error) {
  console.log(error instanceof StructError)
  console.log(error.issues[0]?.code, error.issues[0]?.path)
  console.log(error.flatten().fieldErrors)
  console.log(error.format(), error.prettify())
}
void value
```

`StructIssue` يملك `code` و`expected` و`message` و`path` و`received`. المشاكل يمكن أن تحمل مدخلًا غير موثوق — احجب قبل التسجيل أو الإرجاع. `struct.parse(..., { errorMap })` rewrites issue messages for that call only.

تحقق Struct بنيوي فقط. بلا نطاق عام أو تنسيق أو تحسين أو مصادقة أو قواعد انتقال حالة. افعل تلك الفحوص قبل بناء أمر.

## المرجع

مُنشئات عامة على `@defjs/core` (الداخلية ليست واجهات واجهة):

```typescript twoslash
import { struct } from '@defjs/core'

const Any = struct.any()
const ArrayOfStrings = struct.array(struct.string())
const Bytes = struct.arrayBuffer()
const BigIntValue = struct.bigint()
const BlobValue = struct.blob()
const BooleanValue = struct.boolean()
const DateValue = struct.date()
const Discriminated = struct.discriminatedUnion('kind', [
  struct.object({ kind: struct.literal('created'), id: struct.number() }),
  struct.object({ kind: struct.literal('deleted'), id: struct.number() }),
])
const Status = struct.enum(['draft', 'published'])
const FileValue = struct.file()
const Form = struct.formData({ file: struct.file() })
const Combined = struct.intersection(struct.object({ id: struct.number() }), struct.object({ name: struct.string() }))
const JsonBody = struct.json(struct.object({ ok: struct.boolean() }))
const Literal = struct.literal('ready')
const NullValue = struct.null()
const NumberValue = struct.number()
const ObjectValue = struct.object({ id: struct.number() })
const Union = struct.or(struct.string(), struct.number())
const RecordValue = struct.record(struct.number())
const Request = struct.request({ path: struct.object({ id: struct.number() }) })
const StringValue = struct.string()
const TextBody = struct.text()
const Tuple = struct.tuple([struct.string(), struct.number()])
const Unknown = struct.unknown()
const FormUrlEncoded = struct.urlencoded({ name: struct.string() })

void [Any, ArrayOfStrings, Bytes, BigIntValue, BlobValue, BooleanValue, DateValue, Discriminated, Status, FileValue, Form, Combined]
void [
  JsonBody,
  Literal,
  NullValue,
  NumberValue,
  ObjectValue,
  Union,
  RecordValue,
  Request,
  StringValue,
  TextBody,
  Tuple,
  Unknown,
  FormUrlEncoded,
]
```

| المُنشئ                          | المدخل                                 | المخرج المستنتج                  |
| -------------------------------- | -------------------------------------- | -------------------------------- |
| `struct.number()`                | عدد غير `NaN`                          | `number`، بما في ذلك ±`Infinity` |
| `struct.date()`                  | `Date` أو عدد أو سلسلة تاريخ           | `Date` صالح                      |
| `struct.bigint()`                | `bigint` أو سلسلة يقبلها `BigInt(...)` | `bigint`                         |
| `struct.enum(...)`               | عضو سلسلة أو عدد معلَن                 | اتحاد ذلك الحرفي                 |
| `struct.discriminatedUnion(...)` | كائن بمميّز حرفي مطلوب                 | فرع الكائن المختار               |
| `struct.or(...)`                 | أول فرع مطابق؛ الترميز يفحص الغموض     | اتحاد مخرجات الفروع              |
| `struct.intersection(...)`       | قيم يقبلها كل عضو                      | تقاطع المخرجات                   |
| `struct.record(value)`           | كائن عادي تطابق قيمه `value`           | Record من القيم المحلَّلة        |
| `struct.tuple(items)`            | مصفوفة بالطول المعلَن بالضبط           | tuple بطول ثابت                  |

كل Struct يدعم `.alias(name)` و`.optional()` و`.null()` و`.nullish()`. `struct.discriminatedUnion` يحتاج خيارات كائن بمميّز حرفي مطلوب ويرفض التكرارات.

استورد `struct` و`Infer` و`Struct` و`StructError` والأنواع العامة ذات الصلة من `@defjs/core`. استخدم `struct.parse(...)` كمحلّل. لا تستورد `createObjectStruct` أو رموز التعريف أو داخلية الترميز أو `packages/core/src`.

غير وعود الواجهة:

- مخرجات الكائن/السجل تستخدم نموذج أولي null — لا تفترض طرائق `Object.prototype`.
- مفاتيح الكائن المجهولة تُسقط.
- `struct.number()` يرفض `NaN`، ويقبل اللانهائيات.
- `struct.or(...)` يجرّب الفروع بالترتيب؛ يرفض الترميزات الغامضة عندما تختلف الفروع.
- `struct.intersection(...)` يحلّل الأعضاء بترتيب الإعلان.
- Struct يتحقق من حد؛ لا يخزّن، ولا يفوّض، ولا يملك مورد نقل.

## وصفات ذات صلة

- [POST JSON](../recipes/post-json.md)
- [GET مع 404 معلَن](../recipes/get-declared-404.md)

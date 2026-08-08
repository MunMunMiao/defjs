---
title: Struct
description: صف فك الترميز البنيوي والقيم الصفرية والمدخلات الكائنية الجزئية وaliases والتعامل مع StructError.
---

# Struct

تصف Structs فك الترميز البنيوي والترميز إلى wire. بعض سلوكيات القيم الصفرية فيها مستوحاة من Go، لكنها ليست تطبيقًا كاملًا لدلالات `encoding/json` في Go.

استخدم واجهة `struct` و`Infer<T>` من root entry:

```typescript
import { struct, type Infer } from '@defjs/core'

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

تقبل `struct.any()` و`struct.unknown()` قيمًا بلا قيود. أما binary constructors فهي `struct.blob()` و`struct.file()` و`struct.arrayBuffer()`.

يدعم كل Struct هذه modifiers:

```typescript
struct.string().optional()
struct.string().null()
struct.string().nullish()
struct.string().alias('wire_name')
```

## القيم الصفرية

تُفك القيم المفقودة أو `undefined` إلى قيمة صفرية ما لم يكن Struct اختياريًا. ويتبع `null` مع Struct غير nullable مسار القيمة الصفرية نفسه. أما Struct من نوع nullable فيفك missing أو `undefined` أو `null` إلى `null`.

من القيم الصفرية المختارة:

| Struct                        | القيمة الصفرية                   |
| ----------------------------- | -------------------------------- |
| `string`                      | `''`                             |
| `number`                      | `0`                              |
| `boolean`                     | `false`                          |
| `bigint`                      | `0n`                             |
| `date`                        | `new Date(0)`                    |
| array                         | `[]`                             |
| object                        | كائن تحتوي حقوله قيمها الصفرية   |
| tuple                         | tuple تحتوي عناصره قيمها الصفرية |
| enum                          | أول قيمة معلنة                   |
| literal                       | القيمة الحرفية المعلنة           |
| `blob`, `file`, `arrayBuffer` | قيمة فارغة من النوع المقابل      |
| `any`, `unknown`              | `undefined`                      |

داخل كائن، يُحذف الحقل المفقود الذي يحمل `.optional()` فقط من output بعد فك الترميز. تجمع `.nullish()` بين optional وnullable؛ ولأن معالجة nullable لها الأولوية عند فقدان القيمة، تُفك حاليًا إلى `null`.

```typescript
const Profile = struct.object({
  name: struct.string(),
  nickname: struct.string().optional(),
  biography: struct.string().null(),
})

// Decoding {} produces an object equivalent to:
// { name: '', biography: null }
```

تُسقط مفاتيح الكائن غير المعروفة. وتستخدم مخرجات object وrecord بعد parse prototype مساويًا لـ null. ينبغي للكود الذي يعتمد على دوال `Object.prototype` استخدام `Object.keys` أو `Object.entries`، أو نسخ القيمة عمدًا إلى كائن عادي.

## المدخلات الجزئية مقصودة

خصائص object input اختيارية عند حد TypeScript، حتى حين تكون خاصية output بعد فك الترميز موجودة. وأقسام الطلب في `struct.request(...)` اختيارية أيضًا.

```typescript
const Point = struct.object({
  x: struct.number(),
  y: struct.number(),
})

// A command using Point as input accepts {}.
// Structural decoding produces { x: 0, y: 0 }.
```

لا تصف هذه الحقول بأنها required. لا توفّر Structs تحققًا على مستوى التطبيق من وجود الحقول أو authorization أو range أو amount أو format أو state transition. ولا توجد DSL عامة لـ refine/range/format.

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

// Caller input uses { id, displayName }.
// JSON wire data uses { user_id, display_name }.
```

تفك aliases مفاتيح JSON وترمّزها. ويستخدمها بناء الطلب التلقائي أيضًا لمفاتيح path وquery وheader وURL-encoded وmultipart الصادرة. يستمر المستدعون في استخدام المفاتيح المنطقية. أما target keys الصريحة في إسقاط `build` مخصص فتبقى صريحة.

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
- تغطي [HTTP](/ar/core/http) فك ترميز response وقيد JSON غير الصالح الحالي.

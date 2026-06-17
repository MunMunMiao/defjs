---
title: Struct
description: Declarative schema definition, type inference, error mapping, and the field tag system.
---

# Struct

يوفر `@defjs/core` واجهة struct خفيفة الوزن لتعريف المخططات والتحقق من المدخلات واستنتاج الأنواع. يتمحور القصد التصميمي حول نموذج `encoding/json` في Go: احتياطي القيمة الصفرية، قبول الإدخال الجزئي، وسلوك وقت التشغيل مستقر ومتوقع.

## الأنواع الأولية

تُنشأ جميع المخططات عبر نطاق `struct`، ويدعم استدعاءات السلسلة `.optional()` و `.null()` و `.nullish()` و `.tag(...)`.

### القيم الأساسية

```typescript
import { struct } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  active: struct.boolean(),
  role: struct.literal('admin'),
})

type User = struct.Infer<typeof User>
// { id: number; name: string; active: boolean; role: 'admin' }
```

المتاح:

| المنشئ                 | نوع الإدخال                             | نوع الإخراج   | القيمة الصفرية       |
| ---------------------- | --------------------------------------- | ------------- | -------------------- |
| `struct.string()`      | `string \| undefined`                   | `string`      | `''`                 |
| `struct.number()`      | `number \| undefined`                   | `number`      | `0`                  |
| `struct.boolean()`     | `boolean \| undefined`                  | `boolean`     | `false`              |
| `struct.bigint()`      | `bigint \| string \| undefined`         | `bigint`      | `0n`                 |
| `struct.date()`        | `Date \| number \| string \| undefined` | `Date`        | `new Date(0)`        |
| `struct.null()`        | `null`                                  | `null`        | `null`               |
| `struct.any()`         | `unknown`                               | `any`         | `undefined`          |
| `struct.unknown()`     | `unknown`                               | `unknown`     | `undefined`          |
| `struct.blob()`        | `Blob \| undefined`                     | `Blob`        | `new Blob()`         |
| `struct.file()`        | `File \| undefined`                     | `File`        | `new File([], '')`   |
| `struct.arrayBuffer()` | `ArrayBuffer \| undefined`              | `ArrayBuffer` | `new ArrayBuffer(0)` |

### اختياري وقابل للإلغاء

```typescript
const Profile = struct.object({
  bio: struct.string().optional(), // نوع الإخراج: string | undefined
  age: struct.number().null(), // نوع الإخراج: number | null
  nick: struct.string().nullish(), // نوع الإخراج: string | null | undefined
})
```

### التعدادات والقيم الحرفية

```typescript
const Status = struct.enum(['pending', 'done', 'cancelled'])
const Priority = struct.objectEnum({ Low: 1, Medium: 2, High: 3 })

const Flag = struct.literal(true)
```

### المصفوفات والصفوف والسجلات

```typescript
const Tags = struct.array(struct.string())
const Pair = struct.tuple([struct.string(), struct.number()])
const Dict = struct.record(struct.number())
```

### الاتحادات والتقاطعات

```typescript
const Id = struct.union([struct.string(), struct.number()])
const Named = struct.intersection(struct.object({ id: struct.number() }), struct.object({ name: struct.string() }))
```

### الاتحادات التمييزية

```typescript
const Event = struct.discriminatedUnion('kind', [
  struct.object({ kind: struct.literal('click'), x: struct.number(), y: struct.number() }),
  struct.object({ kind: struct.literal('key'), key: struct.string() }),
])
```

## مخططات الطلب

ينظم `struct.request(...)` المسار `path` والاستعلام `query` والرؤوس `headers` والجسم `body` في هيكل إدخال واحد لبناء طلب HTTP تلقائيًا بواسطة نقطة النهاية.

```typescript
const CreateUser = struct.request({
  path: struct.object({ orgId: struct.number() }),
  query: struct.object({ dryRun: struct.boolean().optional() }),
  headers: struct.object({
    'X-Api-Key': struct.string().tag(tag.header('X-Api-Key')),
  }),
  body: struct.json(
    struct.object({
      name: struct.string().tag(tag.json('user_name')),
    }),
  ),
})
```

أغلفة الجسم تحدد ترميز النقل:

| الغلاف                     | الترميز           |
| -------------------------- | ----------------- |
| `struct.json(schema)`      | `JSON.stringify`  |
| `struct.urlencoded(shape)` | `URLSearchParams` |
| `struct.formData(shape)`   | `FormData`        |
| `struct.text()`            | نص عادي           |
| `struct.blob()`            | Blob ثنائي        |
| `struct.arrayBuffer()`     | ArrayBuffer ثنائي |

## استنتاج النوع `Infer<T>`

يستخرج `struct.Infer<T>` نوع إخراج المخطط. هو المساعد الوحيد على المستوى النوعي الذي تحتاج إلى إتقانه.

```typescript
const Person = struct.object({
  name: struct.string(),
  age: struct.number().optional(),
})

type Person = struct.Infer<typeof Person>
// { name: string; age?: number }
```

يعمل `Infer` أيضًا مع `struct.array(...)` و `struct.union(...)` و `struct.request(...)`:

```typescript
type Tags = struct.Infer<typeof Tags> // string[]
type Id = struct.Infer<typeof Id> // string | number
type Req = struct.Infer<typeof CreateUser> // { path: { orgId: number }; query?: { dryRun?: boolean }; ... }
```

## StructError وتعيين الأخطاء

عند فشل التحقق، يُرجع وقت التشغيل `StructError` يحتوي على `SchemaIssue[]` كاملة.

```typescript
import { struct, StructError } from '@defjs/core'

const [error, value] = struct.parseTuple(User, { id: 42 })
if (error) {
  console.log(error.issues)
  // [{ code: 'missing_key', path: ['name'], expected: 'string', received: undefined, message: '...' }]
}
```

### تنسيق الأخطاء

```typescript
error.format() // كائن شجري { _errors: [], name: { _errors: ['...'] } }
error.flatten() // كائن مسطح { formErrors: [], fieldErrors: { name: ['...'] } }
error.prettify() // سلسلة: "× name: Expected string, received undefined"
```

### تعيين الأخطاء العام

استبدل الرسائل الافتراضية عبر `setErrorMap`:

```typescript
import { setErrorMap } from '@defjs/core'

setErrorMap((issue) => {
  if (issue.code === 'missing_key') {
    return `Field ${issue.path.join('.')} is required`
  }
  return undefined // القضايا غير المغطاة تستخدم الرسائل الافتراضية
})
```

## نظام الوسوم

الوسوم هي بيانات وصفية مرتبطة بالحقول، تقرأها برامج الترميز أو منشئو الطلبات أو المحولات الخارجية. يوفر الأساس 6 نطاقات مدمجة:

| النطاق                  | الغرض                          | السلوك بدون وسيط          |
| ----------------------- | ------------------------------ | ------------------------- |
| `tag.json()`            | مفتاح JSON على السلك           | يعود إلى اسم الحقل        |
| `tag.urlencoded()`      | مفتاح URL-encoded على السلك    | يعود إلى اسم الحقل        |
| `tag.multipart()`       | مفتاح multipart على السلك      | يعود إلى اسم الحقل        |
| `tag.query(fieldName)`  | مفتاح معامل استعلام على السلك  | **يجب توفير الاسم صراحة** |
| `tag.uri(fieldName)`    | مفتاح معامل مسار URI على السلك | **يجب توفير الاسم صراحة** |
| `tag.header(fieldName)` | مفتاح رأس HTTP على السلك       | **يجب توفير الاسم صراحة** |

### مثال الاستخدام

```typescript
import { struct, tag } from '@defjs/core'

const UserBody = struct.object({
  id: struct.number().tag(tag.json('user_id')),
  name: struct.string().tag(tag.json('user_name')),
  email: struct.string().tag(tag.header('X-User-Email')),
})
```

### وسم إعداد مخصص

يتيح `tag.defineConfig` للمكتبات الخارجية تعريف نطاقها الخاص ومفتاح الإعداد:

```typescript
import { tag } from '@defjs/core'

const GormTag = tag.createTagNamespace('gorm')
const gorm = tag.defineConfig(GormTag)

const Model = struct.object({
  id: struct.number().tag(gorm('column', 'id'), gorm('primaryKey')),
})
```

القواعد:

- داخل نفس النطاق، يتجاوز `value` اللاحق السابق.
- داخل نفس النطاق ونفس مفتاح `config`، يتجاوز اللاحق السابق.
- قيمة الإعداد يمكن أن تكون `string | number | boolean` فقط.

### قراءة الوسوم

```typescript
import { getFieldTag, getFieldTags, tag } from '@defjs/core'

const field = UserBody.shape.name
const jsonTag = getFieldTag(field, tag.kind.json, 'name')
// { namespace: JsonTag, value: 'user_name', config: Map() }
```

## فحص الحقول

يُوسّع `getStructFields` مخطط كائن إلى قائمة حقول قابلة للقراءة، تحتوي على مفتاح الحقل والمخطط الفرعي والوسوم المُميّزة.

```typescript
import { getStructFields } from '@defjs/core'

const fields = getStructFields(UserBody)
// [
//   { key: 'id', struct: NumberSchema, tags: Map<symbol, FieldTag> },
//   { key: 'name', struct: StringSchema, tags: Map<symbol, FieldTag> },
// ]
```

يُجمع مع `isObjectStruct` للتحقق الآمن من النوع قبل الفحص:

```typescript
import { isObjectStruct, getStructFields } from '@defjs/core'

if (isObjectStruct(schema)) {
  for (const field of getStructFields(schema)) {
    console.log(field.key, field.tags.get(tag.kind.json)?.value)
  }
}
```

## احتياطي القيمة الصفرية والإدخال الجزئي

يتبع محلل struct دلالات `encoding/json` في Go:

1. **الحقول المفقودة** → تُملأ بقيمة الصفر للنوع، بدلاً من رمي `missing_key`.
2. **الإدخال الجزئي** → يسمح بتمرير بعض الحقول فقط؛ الحقول غير المضبوطة تُملأ تلقائيًا بالقيم الصفرية.
3. **`undefined` و `null`** → الحقول `optional` تُرجع `undefined`؛ الحقول `nullable` تُرجع `null`؛ البقية تُرجع قيم صفرية.

```typescript
const Point = struct.object({ x: struct.number(), y: struct.number() })

struct.parseValue(Point, {}) // { x: 0, y: 0 }
struct.parseValue(Point, { x: 1 }) // { x: 1, y: 0 }
```

هذا بالتصميم، وليس خطأ. المنافع:

- يمكن لنماذج الواجهة الأمامية إرسال الحقول المُعدّلة فقط؛ الخلفية تستلم بنية كاملة.
- يتجنب انتشار `undefined` عبر الكائنات؛ الإخراج دائمًا آمن للتنقل.
- نموذج ذهني متسق مع json unmarshaling في Go، موحّد للتعاون عبر اللغات.

إذا كنت بحاجة إلى تحقق صارم (الحقول المفقودة يجب أن تُظهر خطأ)، تحقق صراحة في دالة `build` للنقطة النهاية، أو استخدم `struct.parseTuple` للتعامل مع النتيجة `[error, value]` بنفسك.

## ما التالي

- [الأوامر →](/core/commands) — استخدام struct مع `defineRequest` و `defineEventStream` و `defineWebSocket`
- [HTTP →](/core/http) — ترميز جسم الطلب والتحقق من الاستجابة
- [السياق →](/core/context) — البناء التلقائي وقدرات منشئ الطلب

---
title: Struct
description: Declarative struct definition, type inference, error mapping, and the field alias support.
---

# Struct

يوفر `@defjs/core` واجهة struct خفيفة الوزن لتعريف المخططات والتحقق من المدخلات واستنتاج الأنواع. يتمحور القصد التصميمي حول نموذج `encoding/json` في Go: احتياطي القيمة الصفرية، قبول الإدخال الجزئي، وسلوك وقت التشغيل مستقر ومتوقع.

## الأنواع الأولية

تُنشأ جميع المخططات عبر نطاق `struct`، ويدعم استدعاءات السلسلة `.optional()` و `.null()` و `.nullish()` و `.alias(name)`.

### القيم الأساسية

```typescript
import { struct, type Infer } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  active: struct.boolean(),
  role: struct.literal('admin'),
})

type User = Infer<typeof User>
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
    'X-Api-Key': struct.string().alias('X-Api-Key'),
  }),
  body: struct.json(
    struct.object({
      name: struct.string().alias('user_name'),
    }),
  ),
})
```

أغلفة الجسم تحدد ترميز النقل:

| الغلاف                     | الترميز           |
| -------------------------- | ----------------- |
| `struct.json(struct)`      | `JSON.stringify`  |
| `struct.urlencoded(shape)` | `URLSearchParams` |
| `struct.formData(shape)`   | `FormData`        |
| `struct.text()`            | نص عادي           |
| `struct.blob()`            | Blob ثنائي        |
| `struct.arrayBuffer()`     | ArrayBuffer ثنائي |

## استنتاج النوع `Infer<T>`

يستخرج `Infer<T>` نوع إخراج المخطط. هو المساعد الوحيد على المستوى النوعي الذي تحتاج إلى إتقانه.

```typescript
const Person = struct.object({
  name: struct.string(),
  age: struct.number().optional(),
})

type Person = Infer<typeof Person>
// { name: string; age?: number }
```

يعمل `Infer` أيضًا مع `struct.array(...)` و `struct.union(...)` و `struct.request(...)`:

```typescript
type Tags = Infer<typeof Tags> // string[]
type Id = Infer<typeof Id> // string | number
type Req = Infer<typeof CreateUser> // { path: { orgId: number }; query?: { dryRun?: boolean }; ... }
```

## StructError وتعيين الأخطاء

عند فشل التحقق، يُرجع وقت التشغيل `StructError` يحتوي على `StructIssue[]` كاملة.

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

## Field Aliases

`.alias(name)` هي الآلية المدمجة الوحيدة لاسم الحقل على wire. تغيّر المفتاح الخارجي المستخدم في ترميز/فك ترميز JSON و query و headers و path و urlencoded و FormData فقط؛ ولا تغيّر اسم خاصية TypeScript أو نوع الإخراج أو request section أو body codec أو المفاتيح المكتوبة صراحة داخل `build(ctx, input)`. الحقول بلا alias تستخدم مفتاح الحقل في الكائن.

```typescript
import { struct } from '@defjs/core'

const UserBody = struct.object({
  id: struct.number().alias('user_id'),
  name: struct.string().alias('user_name'),
})
```

The same alias is used by JSON, query, path params, headers, urlencoded bodies, and multipart bodies. If the same logical value needs different names in different targets, split the struct or write explicit keys in `build(ctx, input)`.

## Field Introspection

`getStructFields` expands an object struct into a readable field list containing field key, alias, and sub-struct.

```typescript
import { getStructFields } from '@defjs/core'

const fields = getStructFields(UserBody)
// [
//   { key: 'id', alias: 'user_id', struct: NumberStruct },
//   { key: 'name', alias: 'user_name', struct: StringStruct },
// ]
```

Combined with `isObjectStruct` for safe type checking before introspection:

```typescript
import { isObjectStruct, getStructFields } from '@defjs/core'

if (isObjectStruct(struct)) {
  for (const field of getStructFields(struct)) {
    console.log(field.key, field.alias)
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

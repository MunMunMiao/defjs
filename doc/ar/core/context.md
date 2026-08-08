---
title: السياق
description: مرّر metadata ضمن نطاق الطلب عبر سلاسل معترضات HTTP وSSE باستخدام HttpContext.
---

# السياق

`HttpContext` حاوية metadata مفهرسة بـ tokens. تنتقل مع تنفيذ HTTP أو SSE، وتكون متاحة على `HttpRequest` الذي تراه المعترضات. ولا تسلسل نفسها إلى URL أو headers أو body.

## Tokens والقيم الافتراضية

أنشئ token مضبوط النوع باستخدام factory للقيمة الافتراضية:

```typescript
import { makeHttpContextToken } from '@defjs/core'

const operationToken = makeHttpContextToken(() => 'unknown-operation')
const requestIdToken = makeHttpContextToken(() => 'missing-request-id')
```

تستدعي `context.get(token)` مصنع token عندما لا يحمل السياق قيمة مخزنة. ولا تُدرج القيمة الافتراضية في السياق، لذلك يستطيع factory ذو حالة إنتاج قيمة جديدة في كل قراءة مفقودة. فضّل قيمًا افتراضية حتمية.

## إنشاء السياق وتمريره

```typescript
import { makeHttpContext } from '@defjs/core'

const context = makeHttpContext().set(operationToken, 'get-user').set(requestIdToken, 'request-42')

const [error, user] = await client.execute(getUser({ path: { id: 42 } }), {
  context,
})
```

تعدّل `set(...)` السياق وتعيد الكائن نفسه لتسلسل الاستدعاءات. وترمي `get(...)` و`set(...)` خطأ `TypeError` للقيم التي ليست tokens أنشأتها `makeHttpContextToken(...)`.

يقرأ المعترض الكائن نفسه:

```typescript
import { createHttpInterceptor } from '@defjs/core'

const operationLogger = createHttpInterceptor(async (request, next) => {
  const operation = request.context?.get(operationToken) ?? 'unknown-operation'
  const requestId = request.context?.get(requestIdToken) ?? 'missing-request-id'

  console.info('outbound request started', { operation, requestId })
  const response = await next(request)
  console.info('outbound request finished', { operation, requestId, status: response.status })
  return response
})
```

استخدم أسماء عمليات ثابتة وmetadata خضعت للمراجعة. لا تضع secrets أو headers خامًا أو bodies أو URLs أو query strings في السجلات افتراضيًا.

## دلالات المرجع

يمرّر التنفيذ `HttpContext` بالمرجع. إذا عدّله معترض، تستطيع المعترضات اللاحقة والمستدعي الذي يحتفظ بالكائن رؤية التغيير.

أنشئ سياقًا جديدًا لكل طلب عندما يحتوي على بيانات request أو user أو tenant أو trace أو cookie أو authorization. قد تؤدي إعادة استخدام سياق واحد قابل للتعديل بين أعمال متزامنة إلى تسريب metadata أو الكتابة فوقها.

تقبل خيارات تنفيذ HTTP وSSE حاليًا `context`. أما خيارات تنفيذ WebSocket فلا تقبله. يحتفظ مقبض SSE المنطقي بسياق الطلب المرتبط بمحاولات اتصاله، ومع ذلك ينبغي للتطبيق اعتباره مملوكًا لنطاق طلب stream.

## النسخ والدمج

تنشئ `makeHttpContext(existing)` نسخة سطحية من خريطة tokens:

```typescript
const base = makeHttpContext().set(operationToken, 'list-users')
const copy = makeHttpContext(base)

copy.set(requestIdToken, 'request-43')
```

الخريطتان منفصلتان، لكن قيم الكائنات المخزنة لا تُنسخ بعمق.

تقبل `makeHttpContext(entries)` أزواج token/value:

```typescript
const context = makeHttpContext([
  [operationToken, 'create-user'],
  [requestIdToken, 'request-44'],
])
```

تعيد `mergeHttpContexts(primary, secondary)` سياقًا جديدًا. تستبدل قيم `secondary` قيم `primary` عند استخدام token نفسه.

```typescript
import { mergeHttpContexts } from '@defjs/core'

const primary = makeHttpContext().set(operationToken, 'default-operation')
const secondary = makeHttpContext().set(operationToken, 'get-user')
const merged = mergeHttpContexts(primary, secondary)

merged.get(operationToken) // 'get-user'
```

حتى تمرير سياق واحد فقط يعيد نسخة منه. وتمرير لا شيء يعيد سياقًا فارغًا.

## API السياق

| العضو               | السلوك                                                     |
| ------------------- | ---------------------------------------------------------- |
| `set(token, value)` | يخزّن قيمة ويعيد السياق نفسه.                              |
| `get(token)`        | يعيد القيمة المخزنة أو يستدعي factory الافتراضي للـ token. |
| `has(token)`        | يختبر وجود قيمة مخزنة.                                     |
| `del(token)`        | يحذف قيمة ويعيد السياق نفسه.                               |
| `keys()`            | يكرّر على tokens المخزنة.                                  |
| `length`            | عدد tokens المخزنة.                                        |

تتوفر `isHttpContext(...)` و`isHttpContextToken(...)` عندما يحتاج الكود إلى runtime guards.

ربط الطلب موضوع منفصل. راجع [الأوامر](/ar/core/commands) لأقسام الطلب التلقائية والإسقاطات المرتبطة بالـ Struct، و[المعترضات](/ar/core/interceptors) لسلوك السلسلة.

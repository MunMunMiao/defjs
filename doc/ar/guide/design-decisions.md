---
title: قرارات التصميم
description: لماذا يستخدم Defjs عملاء صريحين وtuples خاصة بكل وسيلة نقل وخيارات دورة حياة وقت التنفيذ وbuild قائمًا على الإسقاط والمراقبين.
---

# قرارات التصميم

تشرح هذه الصفحة أسباب تصميم الـ API الحالي. أما صفحات المرجع فتصف الحقول والقيم الافتراضية.

## عملاء صريحون

لا يوفّر Defjs عميلًا افتراضيًا على مستوى العملية. تجعل `createClient(...)` الملكية ظاهرة عند موضع الاستدعاء، وتسمح للتطبيق بإنشاء عملاء مختلفين لنقاط نهاية أو credentials أو اختبارات أو نطاقات طلب مختلفة.

لهذا العزل حدود. قد تلتقط المعترضات وoption callbacks حالة مشتركة في التطبيق، لذلك لا يكون كائنان من `Client` معزولين تلقائيًا عن كل ما يحيط بهما. كذلك فإن `setErrorMap(...)` عام على مستوى العملية. ينبغي لكود الخادم إنشاء عملاء ضمن نطاق الطلب عندما تحتوي الخيارات أو closures على بيانات طلب أو مستخدم أو tenant أو cookie أو authorization.

يسهّل العميل الصريح أيضًا مناقشة ملكية الموارد، لكنه ليس مدير موارد. فهو لا يتتبع طلبات HTTP النشطة ولا مقابض SSE ولا جلسات WebSocket، ولا يتخلص منها.

## Tuples خاصة بكل وسيلة نقل

تستخدم كل الأوامر المدعومة tuple يبدأ بالخطأ ويتكون من ثلاثة عناصر، لكن العنصر الثالث يحتفظ بمعناه الخاص بوسيلة النقل:

```typescript
const [httpError, data, response] = await client.execute(httpCommand)
const [sseError, stream, startupOpen] = await client.execute(sseCommand)
const [socketError, session, startupConnection] = await client.execute(socketCommand)
```

يمنع ذلك دمج غلاف استجابة HTTP ولقطة فتح SSE عند البدء ولقطة اتصال WebSocket عند البدء في تجريد مبهم واحد. ويتبع العنصر الثاني القاعدة نفسها: تعيد HTTP بيانات مفكوكة الترميز، ويعيد SSE مقبض stream منطقيًا، وتعيد WebSocket جلسة منطقية.

يجعل الـ tuple أخطاء البدء المتوقعة صريحة من دون فرض control flow قائم على الاستثناءات. لكنه لا يعد بأن المعترضات أو callbacks أو listeners أو القيم غير المدعومة لن ترفض Promise أو ترمي خطأ أبدًا.

## خيارات دورة الحياة تخص التنفيذ

تصف تعريفات نقاط النهاية عقود wire المستقرة، وتملك حدود transport queue المقيدة. أما الإلغاء وtimeout وheartbeat وreconnect فتخص التنفيذ الذي يملك العمل.

تقبل HTTP وSSE خيارات الإلغاء وقت التنفيذ. وتقبل WebSocket أيضًا خيارات `beforeConnect` وheartbeat وreconnect وprotocol لكل تنفيذ. توفّر خيارات العميل قيمًا افتراضية قابلة لإعادة الاستخدام حيث تدعمها وسيلة النقل، بينما تبقى سعات incoming وoutgoing في WebSocket مملوكة لتعريف endpoint.

يجعل هذا الفصل الأمر قابلًا لإعادة الاستخدام. يستطيع job في الخلفية وشاشة تفاعلية تنفيذ الأمر نفسه بأعمار مختلفة، من دون إعادة تعريف path أو message schema.

## يستخدم `build` الإسقاطات

تستقبل `build(request, input)` المخصصة واجهة ربط تصريحية مشتقة من input Struct. ولا تستطيع الوصول إلى قيم المستدعي وقت التشغيل.

تسجّل هذه الواجهة كيفية ربط حقول المصدر بأهداف path وquery وheaders وbody. يدعم هذا النموذج إسقاط الحقول، واختيار مفاتيح wire صراحة، وإسقاط عناصر المصفوفة واحدًا إلى واحد. ويمنع عمدًا التفريع المعتمد على القيم، والتحويلات الاعتباطية، وحقن قيم حرفية في الإسقاط.

يبقي هذا القيد بناء الطلب مرتبطًا بالحقول المعلنة في Struct. طبّع بيانات التطبيق وتحقق من قواعد العمل قبل إنشاء الأمر. راجع [الأوامر](/ar/core/commands) لمعرفة أشكال الإسقاط المدعومة.

## المراقبون لا يملكون control flow

يراقب `onInvalidEvent` في SSE الأحداث التي أُسقطت. تُعزل الأخطاء المطروحة وPromises المرفوضة عن control flow للـ stream، لذلك تستمر المعالجة؛ لكن المراقب async يُنتظر وقد يؤخر الرسائل اللاحقة.

مستمعو الحالة وأخطاء وقت التشغيل في WebSocket مراقبون أيضًا. تُعزل الأخطاء المطروحة وPromises المرفوضة: تُمرّر أخطاء state listener إلى runtime-error listeners، وتُرسل أخطاء runtime-error listener إلى `reportError` العام عند توفره، وتستمر بقية listeners وأعمال lifecycle.

استخدم المقبض أو الجلسة المعادة لاتخاذ قرارات دورة الحياة. واستخدم المراقبين لتسجيل محدود أو metrics أو تحديث حالة، وأزلهم عندما ينتهي مالكهم.

## نشر Sourcemap

اختر sourcemap policy للإنتاج صراحةً:

- **public**: انشر map مع bundle. يحتوي map على `sourcesContent`، ولذلك يصبح source التطبيق والاعتماديات متاحًا للعامة حتى مع relative source paths.

- **hidden**: أزل source-map reference من bundle، وارفع map بشكل خاص إلى error platform، ولا تنشره للعامة. يظل ملف map نفسه محتويًا على paths حساسة و`sourcesContent`؛ كلمة “hidden” لا تجعله آمنًا.

- **disabled**: لا تنتج production map. يمنع ذلك كشف map لكنه يضحي بـ source-level production stack symbolication ويصعّب debugging.

قيّد وصول map الخاص ومدة الاحتفاظ به مثل أي debugging artifact. Relative paths وحدها ليست confidentiality boundary.

## حدود OpenAPI

اختر مصدر contract موثوقًا واحدًا. على المؤسسة التي لديها OpenAPI workflow قائم أن تبقيه وتستخدم mature generator مع explicit runtime validator عند application boundary؛ TypeScript types المولدة وحدها لا تتحقق من response وقت التشغيل. في greenfield Defjs service، عرّف wire contract مباشرة باستخدام Defjs Structs وendpoint definitions.

لن يضيف Core OpenAPI generator/exporter ولن يحافظ على OpenAPI وDefjs كمصدرين متزامنين. Dual-source drift أسوأ من تركيب الأدوات الناضجة عند boundary واضحة.

## مرجع مرتبط

- توثّق [العميل](/ar/core/client) تركيب الخيارات ونطاق العميل.
- توثّق [الأخطاء](/ar/core/errors) فشل الـ tuple وتوفر الاستجابة.
- توثّق [SSE](/ar/core/sse) و[WebSocket](/ar/core/web-socket) المقابض المنطقية والمحاولات الفعلية والإغلاق النهائي.

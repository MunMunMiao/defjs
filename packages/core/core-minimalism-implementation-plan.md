# @defjs/core 极简化实施计划

## 背景

本计划基于对 `packages/core` 的只读审查结果整理，目标是用“极简、极客、少代码”的标准压缩重复实现，同时保留当前 core 的关键设计边界。

本计划不追求一次性大重构。优先删除重复表达、死状态、测试便利入口和类型体操；暂缓会改变 public API、协议边界或生命周期语义的改动。

## 目标

1. 减少同一概念在 HTTP、SSE、WebSocket、struct、client 层的重复实现。
2. 删除没有运行时价值的 wrapper、死字段、测试专用入口和重复 helper。
3. 保持 public API 稳定，除非某一阶段明确标记为 breaking。
4. 保持 `struct` 的 Go 风格零值语义、alias wire key 语义、prototype pollution 防御和 request build bound view 约束。
5. 每一波改动都能独立验证、独立回滚。

## 人类可读性硬约束

本计划里的“极简”不是追求最少字符数，而是追求更低的理解成本。实施时必须遵守以下约束：

1. **读者优先于抽象**：如果抽 helper 后需要读者跳转更多文件才能理解行为，且重复代码本身短而清楚，宁可保留局部重复。
2. **领域命名优先于通用命名**：新 helper 的名字必须说明业务语义，例如 `createFetchInitBase`、`serializeScalarRequestValue`；避免 `handleValue`、`processConfig`、`normalizeThings` 这类泛名。
3. **显式保留协议差异**：HTTP、SSE、WebSocket 行为不同的地方必须在代码中可见。不能为了 DRY 把差异藏进布尔参数或复杂策略对象。
4. **小抽象，不造框架**：内部 helper 应只服务当前明确重复点；不要引入 registry、adapter、mini framework 或多层泛型来换取少几行。
5. **类型体操要有出口**：type-only 重构可以减少重复，但必须让 public 类型别名仍然是读者入口；复杂条件类型要收敛到少数命名清楚的中间类型。
6. **局部性优先**：只在两个以上模块稳定复用时才新增 internal 文件；只在同一文件复用时优先放文件内私有 helper。
7. **少注释但保留不变量注释**：不要为普通代码写解释性注释；但对安全边界、协议差异、兼容性取舍要保留一行短注释。
8. **删除后更好读才删除**：删掉 wrapper、缓存或中间结构后，如果调用点出现大量 cast、动态索引或难懂分支，说明删错了，应退回或换更直观的形态。

每个实施 PR 的 review 都要显式回答：改完后，一个第一次读这段代码的人是否更容易知道它在做什么、为什么这么做、哪些行为不能变。

## 非目标

以下内容不纳入本轮实施，避免为了少代码破坏设计骨架：

1. 不移除 `struct` 缺失字段零值默认值。
2. 不把 `Object.create(null)` 改成普通 `{}`。
3. 不把 `build(ctx, input)` 的 bound view 改成 raw input。
4. 不强行合并 HTTP、SSE、WebSocket 三套 executor 生命周期。
5. 不在瘦身 PR 中顺手删除 root `export * from './internal'`。
6. 不重写 WebSocket 状态机、reconnect、heartbeat 主流程。

## 总体推进原则

- 先做 type-only 与纯内部 wrapper 清理。
- 再做重复 request/fetch/serializer 路径合并。
- 再做 struct 内部索引与 codec 小型瘦身。
- API 收口、bound view 重新设计、WebSocket 生命周期重切单独立项。
- 每个阶段完成后必须运行对应测试；失败时不扩大范围，先回滚或拆小。
- 每个新增 helper 都必须满足“三问”：名字是否说明用途、调用点是否更短且更清楚、错误边界是否仍然显式。
- 避免把直白重复改成间接复杂。删除行数不是验收标准，降低认知负担才是验收标准。

---

## Wave 1：低风险瘦身

目标：删除明显重复和死代码，不改变 public runtime 行为。

### 1.1 合并 HTTP success/error 类型推导

涉及文件：

- `packages/core/src/http/http.ts`
- `packages/core/src/http/http.type.test.ts`
- 可能涉及 `packages/core/src/client/*.type.test.ts`

当前问题：

- `RequestSuccessData<TOutput>` 与 `RequestErrorData<TOutput>` 重复表达 `TOutput -> { body, status } union -> status filter -> Infer<body>`。

实施步骤：

1. 抽内部类型 `ResponsePair<TOutput>`，统一归一化 object output 与 array output。
2. 抽内部类型 `ResponseBodyByStatus<TOutput, TOk extends boolean>`。
3. 保留 public 类型名：
   - `RequestSuccessData<TOutput>`
   - `RequestErrorData<TOutput>`
4. 保留 `[never] -> unknown` 默认语义。
5. 可读性要求：中间类型最多两层，名字必须表达“从 output 取 response pair”和“按 status 取 body”，不要把重复条件类型改成更难读的嵌套 `infer` 迷宫。
6. 补最小 type tests：
   - object output 的 2xx / 4xx 推断。
   - array output 的单 status / 多 status 推断。
   - 只有 2xx 时 error data 默认值。
   - 只有非 2xx 时 success data 默认值。
   - `output` 缺省时的现有行为。

验证：

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core test:type
```

### 1.2 合并 command input optional 判定

涉及文件：

- `packages/core/src/http/http.ts`
- `packages/core/src/sse/sse.ts`
- `packages/core/src/web_socket/web_socket.ts`
- 可能新增内部类型文件，或放入已有 command/type utility。

当前问题：

- HTTP、SSE、WebSocket 三处重复表达 input 是否可省略。

实施步骤：

1. 抽内部类型 `IsEndpointInputOptional<TInput>`。
2. 抽内部类型 `EndpointCommandBuilder<TInput, TCommand>` 或类似命名。
3. 三个 transport 只保留语义化别名：
   - `RequestCommandBuilder`
   - `EventStreamCommandBuilder`
   - `WebSocketCommandBuilder`
4. 不改变 overload 的用户体验。
5. 可读性要求：公共别名仍要保留 transport 语义；不要让用户或维护者只看到一个过度泛化的 `CommandBuilder`。

验证：

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core test:type
```

重点确认：

- required input 仍必须传。
- optional object input 仍可省略。
- `undefined` input endpoint 仍可无参调用。

### 1.3 删除 command entry tuple guard

涉及文件：

- `packages/core/src/client/client.ts`
- `packages/core/src/client/command.ts`
- `packages/core/src/client/execute.spec.ts`
- `packages/core/src/client/client.type.test.ts`

当前问题：

- `isHttpCommandEntry()` / `isEventStreamCommandEntry()` / `isWebSocketCommandEntry()` 只检查 tuple 的 `entry[0]`，运行时没有必要绕 entry tuple。

实施步骤：

1. 保留 `client.execute(command, options?)` 的 public overload。
2. 删除内部 `*CommandEntry` 类型与 `is*CommandEntry()` runtime guard。
3. `execute()` 内直接基于 command type 分派：
   - `HTTP_COMMAND`
   - `EVENT_STREAM_COMMAND`
   - `WEB_SOCKET_COMMAND`
4. unsupported command 仍返回现有错误行为。
5. 可读性要求：分派代码应是一眼可读的 `switch` 或清晰 `if` 链；不要引入 command registry 或 adapter 表来替代三条直观分支。

验证：

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.ts src/client/execute.spec.ts src/client/client.spec.ts
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core test:type
```

### 1.4 用 `assignDefined` 压缩 client option setter

涉及文件：

- `packages/core/src/client/option.ts`
- `packages/core/src/client/client.spec.ts`

当前问题：

- `withSSEOptions()` 与 `withWebSocketOptions()` 手写多段 `if (x !== undefined)`。
- 单字段 helper 与 bulk helper 分散维护。

实施步骤：

1. 在 `option.ts` 内新增小 helper：

   ```ts
   function assignDefined<T extends object>(target: T, source: Partial<T>): void
   ```

2. `withSSEOptions()` / `withWebSocketOptions()` 改用该 helper。
3. 单字段 helper 可改为调用 bulk helper，例如：
   - `withSSEQueue(options)` -> `withSSEOptions({ queue: options })`
   - `withWebSocketReconnect(options)` -> `withWebSocketOptions({ reconnect: options })`
4. 保持 `undefined` 不覆盖默认值。
5. 可读性要求：`assignDefined` 只能做浅层、忽略 `undefined` 的赋值；不要把它扩展成深 merge、路径赋值或带策略参数的通用工具。

验证：

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.ts src/client/client.spec.ts
```

重点确认：

- `undefined` 不覆盖默认配置。
- 单字段 helper 行为不变。

### 1.5 合并 `Deferred`

涉及文件：

- `packages/core/src/sse/transport/event_stream.ts`
- `packages/core/src/web_socket/web_socket.ts`
- 可能新增 `packages/core/src/internal/deferred.ts`

当前问题：

- SSE 和 WebSocket 各自实现 deferred。

实施步骤：

1. 优先新增内部 helper：

   ```ts
   export function createDeferred<T>(): Deferred<T>
   ```

2. SSE 与 WebSocket 复用。
3. 暂不直接替换成 `Promise.withResolvers()`，除非单独确认浏览器 baseline。
4. 可读性要求：`Deferred<T>` 只表达 promise + resolve + reject，不添加状态位、取消逻辑或生命周期语义。

验证：

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.ts src/sse/transport/event_stream*.spec.ts src/web_socket/web_socket*.spec.ts
```

### 1.6 删除 WebSocket 死状态字段

涉及文件：

- `packages/core/src/web_socket/web_socket.ts`
- `packages/core/src/web_socket/heartbeat.ts`
- 相关测试 mock。

当前问题：

- `SocketRefState.promise` 没有实际用途。
- `SocketRefState.socket` 只赋值不读取。
- `HeartbeatSession.lastRuntimeError` 只声明/初始化不使用。

实施步骤：

1. 删除上述字段定义。
2. 删除 `state.socket = session`。
3. 同步删除测试 mock 中的对应字段。

验证：

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.ts src/web_socket/*.spec.ts
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core typecheck
```

### 1.7 删除 `createWebSocketUrl()` 测试便利入口

涉及文件：

- `packages/core/src/web_socket/build.ts`
- `packages/core/src/web_socket/build.spec.ts`

当前问题：

- 生产路径使用 `createWebSocketRequest()` + `createWebSocketUrlFromRequest()`。
- `createWebSocketUrl()` 复制 URL 构建路径，主要服务测试。

实施步骤：

1. 测试改走真实生产路径：

   ```ts
   const request = createWebSocketRequest(...)
   const url = createWebSocketUrlFromRequest(request)
   ```

2. 删除 `createWebSocketUrl()`。
3. 保留 request 路径，以支持 WebSocket interceptor 修改 `queryString`。

验证：

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.ts src/web_socket/build.spec.ts src/web_socket/web_socket.spec.ts
```

### 1.8 复用内部 AbortSignal 合并 helper

涉及文件：

- `packages/core/src/internal/abort.ts`
- `packages/core/src/sse/transport/event_stream.ts`

当前问题：

- internal 已有 `mergeAbortSignals()`。
- SSE transport 另有本地 `combineAbortSignals()`。

实施步骤：

1. 在 SSE transport 中复用 internal helper。
2. 删除本地 `combineAbortSignals()`。
3. 不改变 abort/timeout 错误归一化。

验证：

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.ts src/internal/abort.spec.ts src/sse/transport/event_stream.advanced.spec.ts
```

---

## Wave 2：重复路径合并

目标：合并 HTTP/SSE/WebSocket 周边的重复请求构建、fetch init、serializer 与 response parsing。

### 2.1 抽 HTTP/SSE base request builder

涉及文件：

- `packages/core/src/http/request.ts`
- `packages/core/src/sse/request.ts`
- 可能新增 `packages/core/src/internal/transport_request.ts` 或类似文件。

当前问题：

- HTTP 与 SSE 重复构造 endpoint、headers、queryParams、queryString。

实施步骤：

1. 抽内部 helper，例如：

   ```ts
   createBaseTransportRequest({
     transport,
     method,
     path,
     input,
     build,
     options,
   })
   ```

2. helper 统一处理：
   - `buildRequest()`
   - complex query 判断
   - `createSearchParams()`
   - `new Headers()`
   - `appendRecordToHeaders()`
   - `fillUrl()`
   - `queryString`
3. HTTP 分支只追加：
   - body
   - content type metadata
   - responseType
   - upload/download progress
   - xsrf
4. SSE 分支仍传 `transport: 'sse'`，确保 body 仍被拒绝。
5. 可读性要求：base helper 只负责共同的 request skeleton；HTTP 的 body/content-type/progress/xsrf 和 SSE 的 body 禁止规则必须留在各自调用点或以清楚命名暴露，不能藏在布尔开关里。

验证：

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.ts src/http/request.spec.ts src/sse/request.spec.ts src/internal/request_builder.spec.ts
```

### 2.2 抽 fetch init base helper

涉及文件：

- `packages/core/src/http/transport/fetch.ts`
- `packages/core/src/sse/transport/event_stream.ts`

当前问题：

- HTTP 与 SSE 重复组装 fetch `RequestInit` 的平台规则。

实施步骤：

1. 抽内部 helper：

   ```ts
   createFetchInitBase(request, { headers, signal, defaultAccept })
   ```

2. helper 负责：
   - 默认 Accept
   - credentials
   - body serialization
   - signal
   - streaming request body `duplex`
3. HTTP 保留：
   - content-type apply
   - XSRF
   - upload progress
4. SSE 注意：
   - 不要破坏跨重连的 `last-event-id` header 更新。
   - 不要覆盖用户显式 Accept。
5. 可读性要求：helper 参数必须用具名对象表达 `headers`、`signal`、`defaultAccept` 等差异；不要用位置参数或布尔参数让调用点变成猜谜。

验证：

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.ts src/http/transport/fetch.spec.ts src/http/transport/fetch.streaming.spec.ts src/sse/transport/event_stream.advanced.spec.ts
```

### 2.3 抽 scalar serializer，保留复杂值策略差异

涉及文件：

- `packages/core/src/internal/url.ts`
- `packages/core/src/internal/request_builder.ts`
- `packages/core/src/web_socket/build.ts`

当前问题：

- 多处重复 `string/number/boolean/bigint/null` 到 string 的转换。
- 但 HTTP/SSE 与 WebSocket 对复杂 query 的策略不同。

实施步骤：

1. 抽 `serializeScalarValue(value)`。
2. HTTP/SSE 默认 query 保持当前复杂值行为。
3. WebSocket query 保持 object -> JSON、bigint -> string 的行为。
4. 如果扩展 `createSearchParams()`，必须显式传策略：

   ```ts
   {
     complex: 'skip' | 'reject' | 'json'
   }
   ```

5. 不允许隐式把 HTTP/SSE 复杂 query 放宽为 JSON。
6. 可读性要求：复杂值策略要在调用点直接可见，例如 `complex: 'json'`；不要用 `allowComplex: true` 这类读不出行为的布尔命名。

验证：

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.ts src/internal/url.spec.ts src/internal/request_builder.spec.ts src/web_socket/build.spec.ts
```

### 2.4 合并 response body parser 小 helper

涉及文件：

- `packages/core/src/http/transport/fetch.ts`
- `packages/core/src/http/transport/utils.ts`

当前问题：

- `parseNativeResponseBody()` 和 `parseBody()` 都按 responseType switch。

实施步骤：

1. 抽共享小 helper：
   - `parseJsonText(text)`
   - `parseBytesBody(responseType, content, contentType)`
2. 保留无 download progress 时的 native Response parser，避免额外内存复制。
3. 确保 JSON 空字符串仍返回 `null`。

验证：

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.ts src/http/transport/fetch.response.spec.ts src/http/transport/fetch.streaming.spec.ts src/http/http.response_type.spec.ts
```

### 2.5 避免每次 response lookup 都建 output Map

涉及文件：

- `packages/core/src/http/request.ts`
- `packages/core/src/http/http.ts`

当前问题：

- 每次响应解析都 normalize output shape 成 `Map`，随后只查一次 status。

实施步骤：

1. 将 `resolveOutputStruct(output, status)` 改为直接查找。
2. object output 直接按 status string key 取。
3. array output 扫描 `status` / `status[]`。
4. 若保留重复 status 后者覆盖语义，数组反向扫描。
5. 补测试锁定重复 status 行为。
6. 可读性要求：直接查找逻辑应比建 `Map` 更直观；若为了保持覆盖语义写出难懂扫描代码，应优先保留当前 `Map` 或在 definition 创建阶段预归一化。

验证：

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.ts src/http/http.response_type.spec.ts src/http/http.error.spec.ts src/http/request.spec.ts
```

### 2.6 WebSocket send queue 改数组或数组读指针

涉及文件：

- `packages/core/src/web_socket/queue.ts`
- `packages/core/src/web_socket/queue.spec.ts`

当前问题：

- 同步 string FIFO queue 使用自定义单链表，机制偏重。

实施步骤：

1. 用 `string[]` 或数组 + read pointer 表达 queue。
2. 保留 overflow 策略：
   - `drop-oldest`
   - `drop-newest`
   - `error`
3. 保留 `maxSize: 0` 当前行为。
4. 保留 `clear()` / `shift()` / `enqueue()` public/internal 行为。
5. 可读性要求：优先选择普通数组；只有测试或性能证据证明 `shift()` 不合适时才使用读指针。不要为了理论复杂度重新造一个更难读的队列结构。

验证：

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.ts src/web_socket/queue.spec.ts src/web_socket/web_socket.reconnect.spec.ts
```

---

## Wave 3：struct 内部瘦身

目标：压缩 struct 内部重复索引、sentinel 和 codec builder 小机制；不改变 public struct API。

### 3.1 删除 request definition 的 `sections`

涉及文件：

- `packages/core/src/struct/constructors.ts`
- `packages/core/src/struct/types.ts`
- `packages/core/src/struct/parse.ts`
- `packages/core/src/struct/encode.ts`

当前问题：

- request definition 同时保存 direct fields 与 `sections`。
- parse/encode/zero 遍历 `sections`，request builder 读 direct fields。

实施步骤：

1. 删除 `RequestSection` 类型。
2. 删除 `sections` 字段。
3. 删除 `createRequestSections()`。
4. 新增固定 request key 列表：

   ```ts
   const REQUEST_SECTION_KEYS = ['path', 'query', 'headers', 'body'] as const
   ```

5. parse/encode/zero 直接按固定顺序读取 definition direct fields。
6. 保持输出顺序：path -> query -> headers -> body。
7. 可读性要求：固定 key 列表要放在离 request parse/encode 逻辑近的位置，并用清楚命名表达这是 request section 顺序；不要用动态 `Object.entries(definition)` 之类依赖对象属性顺序的写法。

验证：

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.ts src/struct/parse.spec.ts src/struct/coverage.spec.ts src/internal/request_builder.spec.ts
```

### 3.2 合并 duplicate wire key 检查

涉及文件：

- `packages/core/src/struct/shape.ts`
- `packages/core/src/struct/fields.ts`
- `packages/core/src/struct/runtime.spec.ts`
- `packages/core/src/struct/shape.spec.ts`

当前问题：

- `resolveObjectShape()` 与 `resolveStructFields()` 都检查 duplicate wire key。

实施步骤：

1. 优先只保留 `resolveStructFields()` 中的 duplicate wire key 检查。
2. `resolveObjectShape()` 只负责：
   - descriptor/getter snapshot
   - struct 断言
   - cache
3. 同步调整测试中“抛错时机”的断言。
4. 不改变错误消息，除非测试必须同步。
5. 可读性要求：删除重复检查后，调用路径中仍必须清楚看到 alias/wire key 校验会发生；如果读者需要知道隐式副作用才能理解安全性，应保留一行短注释或更清晰的函数名。

禁止改动：

- 不改 `Object.create(null)`。
- 不改 property descriptor 读取。
- 不改 recursive getter shape 支持。
- 不直接外露 internal field object。

验证：

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.ts src/struct/runtime.spec.ts src/struct/shape.spec.ts src/struct/parse.security.spec.ts src/struct/codec/json.spec.ts
```

### 3.3 内联 encode/match flag sentinel

涉及文件：

- `packages/core/src/struct/encode.ts`
- `packages/core/src/struct/match.ts`

当前问题：

- encode 使用 `NO_FLAG_MATCH` symbol 和 `encodeFlagValue()` 表达 null/undefined guard。
- match 有类似三态 helper。

实施步骤：

1. 在 `encodeValue()` 顶部直接处理：
   - nullable/null
   - optional/undefined
2. 在 `matchesDefinition()` 顶部直接处理同类 flag。
3. 删除 sentinel 和小 helper。
4. 保持 null/undefined 当前语义。
5. 可读性要求：内联 guard 后应形成清楚的函数入口边界；如果内联导致 `encodeValue()` / `matchesDefinition()` 顶部过长，就保留一个命名明确的 helper，而不是追求删除 helper。

验证：

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.ts src/struct/encode.spec.ts src/struct/coverage.spec.ts
```

### 3.4 primitive match 数据驱动

涉及文件：

- `packages/core/src/struct/match.ts`
- `packages/core/src/struct/constructors.ts`
- `packages/core/src/struct/encode.spec.ts`

当前问题：

- primitive definition 已有 `is` / `runtimeIs`，match 仍手写多个 kind 判断。

实施步骤：

1. 为 Blob/File/ArrayBuffer 等补安全 `runtimeIs`。
2. primitive match 使用：

   ```ts
   ;(definition.runtimeIs ?? definition.is)(value)
   ```

3. parse 仍使用 `definition.is`，不要混淆 input 与 runtime output。
4. 可读性要求：primitive 的 input guard 与 runtime output guard 必须在命名上区分清楚；不要把两者压成一个看似通用但语义模糊的 `check`。

验证：

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.ts src/struct/encode.spec.ts src/struct/constructors.primitives.spec.ts
```

重点确认：

- Date/BigInt 字符串输入不要被 runtime match 误判。
- Blob/File 在运行时不存在时不抛 ReferenceError。

### 3.5 简化 flat codec builder interface

涉及文件：

- `packages/core/src/struct/codec/flat.ts`
- `packages/core/src/struct/codec/query.ts`
- `packages/core/src/struct/codec/urlencoded.ts`
- `packages/core/src/struct/codec/multipart.ts`

当前问题：

- flat codec 既有 `forEachEncodedWireField()`，又有 `encodeFlatByAlias({ create, put })` 小工厂。

实施选项：

- 推荐选项：只保留 `forEachEncodedWireField()` 作为原语。
- query/urlencoded/multipart 各自直接创建目标容器并 append。
- 删除 `FlatEncodeOptions` 与 `encodeFlatByAlias()`。
- 可读性要求：保留的原语必须让 query/urlencoded/multipart 调用点读起来像“遍历字段并 append”，不要为了复用重新引入 create/put 协议或隐式 builder。

验证：

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.ts src/struct/codec/query.spec.ts src/struct/codec/urlencoded.spec.ts src/struct/codec/multipart.spec.ts src/struct/coverage.spec.ts
```

---

## Wave 4：单独设计议题

这些任务不应混入前面瘦身 PR。每一项都需要单独设计、单独评审、单独验证。

### 4.1 root `internal` public export 收口

涉及文件：

- `packages/core/src/public_api.ts`
- `packages/core/src/internal/public_api.ts`
- `packages/core/src/client/public_api.ts`
- `packages/core/src/http/public_api.ts`

问题：

- root `export * from './internal'` 让 internal 概念成为 public API。

建议方向：

1. 先确认 `HttpContext`、`SettledResponse`、`makeResponse` 等是否承诺给用户。
2. 若需要 public，迁到明确 public 模块。
3. 若要收口，先 deprecate，再 breaking remove。
4. 增加 public API type tests。

### 4.2 request build bound view 是否重新设计

涉及文件：

- `packages/core/src/internal/request_builder.ts`
- `packages/core/src/struct/README.md`
- `packages/core/design.md`

问题：

- bound view / projection / owner 校验让实现很重。

当前建议：

- 本轮不改。
- 只能局部压缩 plan builder/materializer 重复。
- 若要改成 raw input，需要另做 breaking design。

### 4.3 WebSocket heartbeat 边界重切

涉及文件：

- `packages/core/src/web_socket/heartbeat.ts`
- `packages/core/src/web_socket/web_socket.ts`

建议方向：

- heartbeat 只负责 interval、ack timeout、markAck、stop。
- encode/send/close/queue clear 留给 `web_socket.ts`。

风险：

- 生命周期与 reconnect 竞态较多，不放入普通瘦身阶段。

### 4.4 `connectOnce()` listener cleanup 是否使用 `{ signal }`

涉及文件：

- `packages/core/src/web_socket/web_socket.ts`
- `packages/core/src/web_socket/web_socket.lifecycle.spec.ts`

建议方向：

- 若确认 WebSocket handle/polyfill 支持 `addEventListener(..., { signal })`，可删除手动 removeEventListener 机制。
- 若要兼容窄 EventTarget mock，保留手动 cleanup。

---

## 推荐分支与提交拆分

建议拆成多个小提交或小 PR：

1. `refactor(core): collapse http output data types`
2. `refactor(core): share endpoint command builder types`
3. `refactor(core): simplify client command dispatch`
4. `refactor(core): assign defined client options`
5. `refactor(core): share deferred helper`
6. `refactor(core): remove websocket dead state`
7. `refactor(core): remove websocket test url shortcut`
8. `refactor(core): reuse abort signal merge helper`
9. `refactor(core): share base transport request assembly`
10. `refactor(core): share fetch init base`
11. `refactor(core): share scalar request value serialization`
12. `refactor(core): simplify websocket send queue`
13. `refactor(core): remove request section cache`
14. `refactor(core): trim struct field resolution duplication`

每个提交都应保持测试可运行，不建议把 Wave 1-3 混成一个大提交。

## 最小全量验证

每个 Wave 完成后，至少运行：

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core test:type
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core test
```

如果只改 type-only，可先运行：

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core test:type
```

如果只改某个 runtime 小模块，可先运行目标 spec，再运行 core 全量测试。

## 人类可读性审查清单

每个实施提交进入 review 前，必须逐项检查：

1. **调用点是否更直观**：改完后的调用点应该比改前更容易读；如果只是把重复藏到 helper 里，不能算完成。
2. **helper 是否单一职责**：一个 helper 只做一件事；若名字里需要用 `And`，通常说明它该拆开。
3. **协议差异是否可见**：HTTP、SSE、WebSocket 的差异必须能从调用点或函数名看出来，不靠读 helper 内部猜。
4. **类型是否能被解释**：新增条件类型应能用一句话解释；如果解释必须复述整段实现，说明类型设计过度。
5. **错误路径是否清楚**：重构后错误抛出位置、错误文案和错误归类必须仍然容易追踪。
6. **测试是否锁语义而非实现细节**：测试应证明 public 行为和关键边界，不要因为内部 helper 改名而大面积失败。
7. **删除是否留下隐性知识**：删掉中间结构后，如果某个不变量只存在于维护者脑中，必须用函数名、测试名或短注释把它留在代码里。
8. **是否避免“聪明代码”**：不要用高度泛型、动态 dispatch、布尔参数矩阵或隐式 registry 换取少数行数。

## 风险清单

| 风险                                  | 说明                                                   | 应对                             |
| ------------------------------------- | ------------------------------------------------------ | -------------------------------- |
| public type 推断回归                  | HTTP output data、command builder 属于 public 类型体验 | 先补 type tests，再重构          |
| 错误抛出时机变化                      | duplicate wire key 检查从 shape 阶段挪到 fields 阶段   | 同步测试语义，确认调用路径仍会抛 |
| query 复杂值策略被混同                | HTTP/SSE 与 WebSocket 当前策略不同                     | 只抽 scalar，复杂策略显式传参    |
| SSE last-event-id header 断链         | fetch init helper 若 clone headers 可能破坏重连更新    | helper 接收并复用 headers 对象   |
| WebSocket queue `maxSize: 0` 语义改变 | 数组改写容易漏掉特殊行为                               | 保留并单测该行为                 |
| Abort/timeout 错误归一化改变          | 合并 helper 时可能改变 reason                          | 跑 abort/retry 专项测试          |
| `internal` export 误删                | 已经进入 root public API                               | 不在瘦身 PR 中处理               |

## 完成标准

一个阶段完成需同时满足：

1. 实现只覆盖该阶段范围，不顺手扩大。
2. 对应专项测试通过。
3. `@defjs/core` 的 `test:type` 通过。
4. 运行时改动阶段需 `@defjs/core test` 通过。
5. 人类可读性审查清单全部通过。
6. 最终说明中明确列出：
   - 改了什么。
   - 删了什么。
   - 哪些代码因此更容易读。
   - 哪些语义刻意保持不变。
   - 哪些高风险议题被暂缓。

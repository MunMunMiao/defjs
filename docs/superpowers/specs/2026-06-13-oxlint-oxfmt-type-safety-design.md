# Oxlint/Oxfmt 与类型安全收口设计

日期：2026-06-13

## 背景

当前 `feat/up` 分支需要同时收口三类约束：

1. 项目入口必须通过 `public_api.ts` 约束导出内容。
2. import 必须顶置，不允许运行时或类型位置的内联 import，也不允许 namespace import。
3. 全部代码必须严格保证类型安全；如果确实需要绕过或强制转换，正常代码和测试代码都必须备注原因。

用户已确认采用深度类型治理路线：优先重构类型表达，尽量消灭 `any`、`as never`、`as unknown as` 和无依据断言；少数不可避免的边界断言必须有邻近备注。

用户同时确认工具链方向：使用 Oxlint 代替 lint，使用 Oxfmt 代替 fmt/format；不使用 `check:constraints` 或任何类似的独立项目约束检查命令。

## 目标

- 用 Oxlint/Oxfmt 替换当前 Biome lint/format 入口。
- 统一模块入口：`index.ts` 只 re-export `./public_api`。
- 移除类型位置 `import('...')` / `typeof import('...')`，改为顶部显式命名 import。
- 禁止 namespace import，包括 `import * as X` 和 `import type * as X`。
- 深度治理类型绕过：生产代码和测试代码都优先用类型表达真实约束。
- 保留少量不可避免断言时，要求邻近备注说明不变量或运行时边界。
- 保持公开 API 语义和运行时行为不变。

## 非目标

- 不新增 `check:constraints`、`check-code-constraints.ts` 或类似独立检查入口。
- 不把 `struct`、HTTP、SSE、WebSocket 的泛型系统改成另一套设计。
- 不引入 ESLint/Prettier 作为本次工具链方案。
- 不承诺 Oxlint/Oxfmt 能自动覆盖所有项目特有规则；不能由工具表达的约束由本次实现和 code review 维护。
- 不将纯格式化 diff 与类型语义变更无节制混合；如 Oxfmt 造成大规模格式差异，需要单独评估。

## 已确认的入口结构缺口

需要补齐 `public_api.ts` 并调整 `index.ts` 的目录：

- `packages/angular/src`
- `packages/vue/src`
- `packages/core/src/error`
- `packages/core/src/http/transport`
- `packages/core/src/struct/codec`

目标结构：

```ts
// index.ts
export * from './public_api'
```

`public_api.ts` 承载该目录允许对外暴露的导出。迁移时先保持当前 `index.ts` 暴露语义不变。

## Import 规则

禁止以下形式：

```ts
type X = import('./index').X
type Y = typeof import('./index').Y
const mod = await import('./mod')
const x = require('./mod')
import type * as PublicApi from './index'
import * as PublicApi from './index'
import { type X, value } from './index'
```

允许形式是独立的顶部命名 import；类型和值分开导入：

```ts
import type { X } from './index'
import { value } from './index'
```

不使用 inline type specifier，例如 `import { type X } from './index'`。类型导入必须使用独立的 `import type { X } from './index'`。

对于 `typeof import('./index').Value`，应改成顶部普通命名 import：

```ts
import { Value } from './index'

type ValueType = typeof Value
```

不使用 `import type * as`；类型引用也必须是独立的显式命名 `import type`。

## 类型安全治理设计

### 总原则

治理优先级：

1. 用更准确的类型表达真实约束，消灭 `any` 和断言。
2. 用 `unknown` 与类型守卫处理运行时边界。
3. 只在 TypeScript 无法表达的封装边界保留断言。
4. 保留断言时邻近备注必须说明：为什么 TypeScript 推不出来，以及哪个运行时检查或封装不变量保证安全。

### 重点区域

#### Interceptor chain

当前 `makeChain` 存在 `next: any` 和返回 `any` 风险。设计方向是拆出更精确的 handler 泛型，或为 HTTP/SSE/WebSocket 分别提供专用 chain builder。必要时牺牲一点复用，换取类型安全。

#### RequestBuilder 与 endpoint build 回调

测试中大量 `(request: any, view: any)` 应被消除。设计方向是让 `buildRequest` 或相关 helper 暴露更精确的 build callback 类型，使 `request` 推导为 `RequestBuilder`，`view` 从 `struct.request(...)` 推导。

目标形态：

```ts
const built = buildRequest(
  { body: { a: '1', b: '2' } },
  (request, view) => {
    request.setFormUrlEncoded({ a: view.body.a, b: view.body.b })
  },
  { input },
)
```

#### Struct 构造器

当前重复出现 `as unknown as Schema...`。设计方向是提取集中 schema 构造 helper，将类型品牌边界收敛到少量可信位置。保留的断言需要说明该 helper 统一构造运行时对象，类型品牌只服务编译期推导。

#### SSE / WebSocket

当前存在多处泛型运行时桥接 cast。设计方向是通过更精确的函数返回类型、中间类型别名和 typed helper 减少调用点断言。对于协议解析后由 schema 保证的类型边界，可以保留断言并加备注。

#### 测试中的非法输入

测试代码同样适用类型安全规则。负向类型测试优先使用带说明的 `@ts-expect-error`。运行时防御测试如果必须构造非法值，应尽量集中到少量带备注 helper，避免裸 `as never` 或无说明 `as unknown as X`。

## 工具链设计

### 脚本语义

根脚本目标形态：

```json
{
  "scripts": {
    "build": "pnpm -r run build",
    "changeset": "changeset",
    "changeset:version": "changeset version",
    "lint": "oxlint .",
    "lint:fix": "oxlint . --fix",
    "fmt": "oxfmt . --write",
    "fmt:check": "oxfmt . --check",
    "test": "pnpm -r run test",
    "typecheck": "pnpm -r --if-present run typecheck",
    "check": "pnpm lint && pnpm fmt:check && pnpm typecheck"
  }
}
```

包级脚本同步从 Biome 改到 Oxlint/Oxfmt。若包级工作目录无法正确读取根配置，则显式传入配置路径，具体以验证结果为准。

### 配置文件

新增或使用：

- `oxlint.config.ts`
- `.oxfmtrc.json`

停止使用并移除 Biome 入口：

- 根 `biome.json`
- 包级 `packages/*/biome.json`
- `@biomejs/biome` dependency
- `biome check` / `biome check --write` 脚本

Oxfmt 配置应迁移当前格式偏好：

```json
{
  "$schema": "./node_modules/oxfmt/configuration_schema.json",
  "printWidth": 140,
  "tabWidth": 2,
  "useTabs": false,
  "semi": false,
  "singleQuote": true,
  "ignorePatterns": [
    "**/node_modules/**",
    "**/dist/**",
    "**/coverage/**",
    "**/test-out/**",
    "**/build/**",
    "**/.next/**",
    "**/out/**",
    "**/.claude/**",
    "**/playwright-report/**",
    "**/blob-report/**",
    "**/test-results/**"
  ]
}
```

Oxlint 配置应尽量覆盖当前 Biome lint 与新增类型安全约束。具体 rule 名和 option 以实际安装版本支持为准；不写不可验证或不存在的假规则。

## 自动化覆盖边界

因为明确不使用独立约束检查命令，自动化边界如下：

| 约束 | 自动化方式 |
| --- | --- |
| `public_api.ts` 出口统一 | 本次手动修复 + code review 维护 |
| 普通 import 顶置 | Oxfmt/Oxlint 尽量覆盖 |
| 禁止运行时 `import()` / `require()` | Oxlint 规则若支持则启用；否则 code review 维护 |
| 禁止类型位置 `import('...')` | Oxlint 规则若支持则启用；否则 code review 维护 |
| 禁止 namespace import | Oxlint 规则若支持则启用；否则 code review 维护 |
| 禁止 `any` | Oxlint TypeScript rule |
| `@ts-expect-error` 必须有说明 | Oxlint 若兼容相关规则选项则启用 |
| non-null assertion | Oxlint TypeScript rule 若支持则启用 |
| `as` 必须有备注 | 本次重构消除 + 保留项人工备注 + code review 维护 |

本设计不声称工具能完全防止未来回退；本次验收要求是当前代码按约束修干净，并通过 Oxlint/Oxfmt/TypeScript/test/build 验证。

## 实施阶段

1. 工具链迁移：引入 Oxlint/Oxfmt，替换 Biome 脚本和配置，不先做大规模格式化。
2. public_api 结构收口：补齐缺失 `public_api.ts`，调整对应 `index.ts`。
3. import 顶置收口：清理类型位置 import、运行时动态 import、require 和 namespace import。
4. 类型深度治理：按 interceptor、RequestBuilder、struct、SSE/WebSocket、测试非法输入的顺序推进。
5. 验证收尾：运行完整验证命令，必要时单独处理 Oxfmt 格式差异。

## 验证计划

最终至少运行：

```bash
pnpm lint
pnpm fmt:check
pnpm typecheck
pnpm test
pnpm build
```

分阶段验证：

- public_api / import 改动后跑 `pnpm typecheck`。
- core 类型重构后跑 `pnpm --filter @defjs/core test`。
- Vue/Angular 入口改动后跑对应 `typecheck` 和 `build`。
- 工具链迁移后分别验证 `pnpm lint` 与 `pnpm fmt:check`。

如果任何验证失败，不把失败写成完成；先说明失败输出、影响范围和下一步建议。

## 风险与处理

### Oxfmt 与 Biome 格式不一致

Oxfmt 可能产生大量格式差异。处理方式是先跑 `fmt:check` 观察差异；如需要格式化，尽量将纯格式化 diff 与类型语义 diff 分离。

### Oxlint 规则覆盖不等于 Biome

Biome 的部分规则可能没有 Oxlint 一比一规则。处理方式是只迁移明确存在且已验证的规则，不伪装覆盖。

### 没有独立 checker

`public_api.ts` 和 “`as` 必须备注” 不能完全自动防回退。处理方式是当前修干净，并在设计文档和后续 code review 中维持约束。

### 深度类型治理牵动公共泛型

`struct`、`RequestBuilder`、SSE/WebSocket 类型推导可能回归。处理方式是小步改动、依赖 type tests 和运行测试验证。

### 测试非法输入表达复杂化

为消灭裸 `as never`，测试可能需要更明确的负向类型表达。处理方式是优先使用带说明的 `@ts-expect-error`，运行时非法值集中到少量带备注 helper。

## 验收标准

- `pnpm lint` 使用 Oxlint 并通过。
- `pnpm fmt:check` 使用 Oxfmt 并通过。
- Biome 不再作为 lint/fmt 工具链入口。
- 确认的模块入口均通过 `public_api.ts`，对应 `index.ts` 只 re-export `./public_api`。
- 没有运行时动态 `import()` / `require()`。
- 没有类型位置 `import('...')` / `typeof import('...')`。
- 没有 namespace import。
- 尽量消灭 `any`、`as never`、`as unknown as` 和无必要 `as`。
- 无法消除的断言有明确邻近备注。
- 测试代码同样满足类型安全备注要求。
- `@ts-expect-error` 均有说明。
- `pnpm typecheck`、`pnpm test`、`pnpm build` 均通过。

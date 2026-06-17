# React 文档站同步设计

## 背景

`doc/` 是当前 VitePress 文档站；`docs/` 存放设计和计划文档。React 包已经存在，主要事实来源包括：

- `packages/react/README.md`
- `packages/react/src/core.tsx`
- `packages/react/src/public_api.ts`
- `packages/react/src/core.browser.spec.tsx`
- `packages/react/src/e2e.browser.spec.tsx`

本次目标是在 `doc/` 文档站中补齐 React 插件说明，并保持所有已存在 locale 的导航与入口一致。

## 范围

### 包含

1. 新增默认语言 React 插件页面：`doc/plugins/react.md`。
2. 为所有现有 locale 新增同构 React 插件页面：`doc/<locale>/plugins/react.md`。
3. 更新 `doc/.vitepress/config.ts`，在默认语言与所有 locale 的插件导航/侧边栏中加入 React。
4. 更新默认语言与所有 locale 的首页 `index.md`，在框架集成区域加入 React 入口。
5. 更新默认语言与所有 locale 的 `guide/design-decisions.md`，补充 React 集成的设计定位。
6. 运行 VitePress 构建验证链接与配置不会破坏文档站。

### 不包含

1. 不修改 React 包源码或测试。
2. 不引入新的 VitePress 插件、Twoslash 配置或文档构建架构。
3. 不扩展 React API，仅记录现有 `ClientProvider`、`useClient`、`withEndpoint`、`withInterceptors`。
4. 不重写已有 Angular/Vue/OpenTelemetry Server 文档结构。

## 文档信息架构

React 文档作为框架集成插件加入现有 `plugins/` 分组，与 Angular、Vue 保持同级：

```text
doc/
  plugins/
    angular.md
    vue.md
    react.md
  <locale>/
    plugins/
      angular.md
      vue.md
      react.md
```

首页的框架集成区增加 React 卡片，指向对应语言下的 React 插件页。

设计决策页增加一段 React 集成说明，强调 React wrapper 是轻量适配层：它负责把 `@defjs/core` client 放入 React Context，并提供 hooks 与 option helper；核心请求、命令、拦截器和错误语义仍由 `@defjs/core` 决定。

## React 插件页内容

每个 `plugins/react.md` 页面包含以下内容，按各语言本地化表达：

1. **概览**：React 集成用于在 React 应用中共享 `@defjs/core` client。
2. **安装**：展示 `@defjs/core`、`@defjs/react` 与 `react` 的安装关系。
3. **ClientProvider**：展示在组件树上层创建并提供 client。
4. **useClient**：展示子组件中读取 client 并执行命令。
5. **Option helpers**：说明 `withEndpoint` 与 `withInterceptors` 用于组合 provider options。
6. **注意事项**：
   - 需要 React 18 或更高版本。
   - 面向 client component 场景。
   - `useClient` 必须在 `ClientProvider` 内调用。
   - React wrapper 不改变 `@defjs/core` 的行为模型。

## 多语言策略

采用“结构一致、内容轻量”的策略：所有 locale 都新增同名页面和入口，避免不同语言站点导航缺项。翻译以现有站点语言为目标语言，代码示例保持一致，API 名和 package 名保持英文原文。

如果某些既有页面已经存在语言不完全准确的问题，本次不顺带修正；仅补充 React 相关内容，避免扩大范围。

## 变更点

预计修改文件：

- `doc/.vitepress/config.ts`
- `doc/index.md`
- `doc/guide/design-decisions.md`
- `doc/plugins/react.md`
- `doc/<locale>/index.md`
- `doc/<locale>/guide/design-decisions.md`
- `doc/<locale>/plugins/react.md`

`<locale>` 为当前 `doc/` 下已有 locale：

- `zh-Hans`
- `zh-Hant-TW`
- `zh-Hant-HK`
- `de-DE`
- `ja-JP`
- `ko-KR`
- `ar`
- `es-ES`
- `ru-RU`
- `fr-FR`

## 验证

完成后运行：

```bash
cd doc && pnpm docs:build
```

验证目标：

1. VitePress 配置可加载。
2. 新增 React 页面可被构建发现。
3. 首页与侧边栏链接不会导致构建失败。
4. 多语言路径保持现有 VitePress 约定。

## 风险与处理

- **翻译风险**：全多语言同步会产生较多自然语言内容。处理方式是保持内容简短、术语稳定、示例一致。
- **导航遗漏风险**：`config.ts` 中每个 locale 都需要加入 React。处理方式是在修改后搜索插件侧边栏配置，确保每个 locale 的 plugins 分组一致。
- **范围扩大风险**：不修改 React 包、不补其他插件文档、不引入新构建能力。若构建暴露既有无关问题，先如实报告，不自动扩大修复范围。

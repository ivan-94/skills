---
name: hat-frontend-friendly
description: 为前端项目设计并实现 HAT-friendly 控制面 `window.__hat`：探索 React/Vue/SSR/老项目技术栈，先输出实现计划并等待确认，再接入 HAT runtime、代表性 scope/action、项目 HAT.md、AGENTS.md/CLAUDE.md 入口和 docs/frontend-hat-friendly-guide.md。Use when the user wants to make frontend pages/components agent-friendly for HAT, avoid brittle E2E clicks on complex UI components, expose discoverable frontend actions for Playwright/Coding Agent/QA Agent, or implement the HAT frontend control protocol.
---

# HAT Frontend Friendly

为当前前端项目实现 Agent-Friendly HAT 控制协议。目标是在浏览器端暴露稳定、可发现、可校验的 `window.__hat`，让 agent 在 HAT/browser 验收中优先调用业务语义 action，而不是点击第三方组件内部 DOM。

详细协议见 `references/hat-frontend-control-protocol.md`。需要实现 runtime、schema、错误结构、React/Vue/SSR 细节时读取它；主流程只保留执行约束。

## 边界

- 默认会改项目代码，但必须先探索并给实现计划，等待用户确认后再落代码；用户明确说“直接做”时仍先做简短探索。
- 默认交付 runtime + 1 个代表性 scope；用户明确要求时支持 runtime-only。
- 默认允许新增依赖，优先 `dependencies`，优先使用 `zod`；新增依赖必须在计划中说明原因、bundle 影响和降级方案。
- 代码可存在于源码中，但 `window.__hat` 默认只在 dev/test/HAT 环境启用；生产默认不挂载。
- 不做通用风险动作限制、不做权限模型、不维护 action 黑名单；项目安全由环境和项目策略负责。
- 不在 `hat-run` skill 中硬编码探测逻辑；本 skill 通过项目 `HAT.md` 告诉验收 agent 如何使用。
- 如果不是前端项目，或找不到浏览器入口，停在 Discovery 阶段并说明不适用原因。

## Discovery

先探索能从代码库确定的信息，不要让用户凭空选择。

- 定位 repo root 和 frontend package；monorepo 中优先识别实际浏览器应用。
- 识别框架和入口：React、Vue、Next、Nuxt、Vite、CRA、Vue CLI、SSR、静态页面、老 JS。
- 读取 `package.json`、入口文件、路由、表单/组件库、状态管理、request client、测试命令、env 约定。
- 查找已有文档：`HAT.md`、`AGENTS.md`、`CLAUDE.md`、`docs/`、既有 HAT 目录。
- 查找候选首个 scope：最近相关页面、复杂表单、筛选面板、弹窗/抽屉、创建/编辑流程。
- 判断是否已有 `zod`、JSON Schema 校验器、测试框架、Playwright/Cypress。

探索后输出简短摘要：

- 技术栈和入口判断。
- 推荐 runtime 放置位置。
- 推荐启用条件。
- 是否新增依赖及原因。
- 推荐首个 scope/action 范围。
- 将修改/新增的文件。
- 验证方式。
- 当前阻塞问题。

## Plan Gate

实现前必须给用户 review 的计划，除非用户明确要求“直接实现”。

计划必须包含：

- framework/package/entry。
- runtime API 覆盖：`discover`、`invoke`、`inspect`、`waitForIdle`、`registerScope`、`action`。
- schema 策略：Zod-first、JSON Schema fallback，或项目适配方案。
- 启用条件：如 `VITE_ENABLE_HAT`、`REACT_APP_ENABLE_HAT`、`NODE_ENV`、SSR client guard。
- 首个 scope：scopeId、为什么选它、3-6 个 action、1 个 inspect。
- 文档产物：`HAT.md`、`docs/frontend-hat-friendly-guide.md`、`AGENTS.md`、`CLAUDE.md`。
- 验证：构建、类型、测试、浏览器 console/Playwright smoke 中能跑的最小闭环。

只问真正阻塞的问题。若用户已指定页面/scope，尊重用户指定。

## Implementation

按项目风格实现，不强塞固定模板。

1. **新增 runtime**
   - 常见落点：`src/hat/`；monorepo 放到具体 frontend package。
   - 实现 `createHat`、`registerScope`、`action`、`discover`、`invoke`、`inspect`、`waitForIdle`。
   - 标准调用是 `window.__hat.invoke(scopeId, actionName, input)`；同时支持 `window.__hat.<scopeId>.<actionName>(input)` 便捷调试。
   - 所有 action 统一接收单个 object input。
   - HAT 启用时注册冲突 fail fast；未启用时可 no-op，不挂载 `window.__hat`。

2. **接入 app**
   - 只在浏览器端挂载；SSR 项目必须 `typeof window !== "undefined"` 后再访问 `window`。
   - 在 app bootstrap、client plugin 或页面生命周期中启用。
   - scope 在组件挂载时注册，在卸载/关闭时 unregister。

3. **接入首个 scope**
   - 默认 1 个 scope、3-6 个业务语义 action、1 个 inspect。
   - scope 粒度用页面、弹窗、抽屉、面板或业务模块，不以单个 DOM 节点为单位。
   - action 使用动词开头、camelCase、业务语义；不要把 DOM selector 包装成协议。
   - `inspect` 返回验收需要判断的最小业务状态，注意脱敏。

4. **补类型/JS 注释**
   - TypeScript 项目必须补 `Window.__hat` 全局声明和核心类型。
   - JavaScript 项目用 JSDoc 描述协议，不为了类型改构建链。

5. **写文档**
   - `HAT.md`：给验收 agent 用，写通用发现、调用、等待、检查和回退策略；不要维护具体 scope/action 清单，具体能力以运行时 `discover()` 为准。
   - `docs/frontend-hat-friendly-guide.md`：给后续 coding agent/开发者用，写本项目如何新增 scope/action 的教程和最佳实践。
   - `AGENTS.md` 和 `CLAUDE.md`：已存在则追加/更新短入口；不存在则创建最小文件。内容只提醒“涉及前端页面/组件时考虑 HAT 适配性”，并指向 `docs/frontend-hat-friendly-guide.md`。

## Runtime Defaults

- 协议入口：`window.__hat`。
- 必备能力：`version`、`discover()`、`invoke()`、`waitForIdle()`、`inspect(scopeId)`。
- 输入协议：JSON Schema-first，Zod-friendly SDK。
- `description` 和 `inputSchema` 默认必备；`examples` 推荐但不强制。
- `invoke` 统一包装结果：成功 `{ ok: true, data }`，失败 `{ ok: false, error }`。
- input 校验失败返回 `VALIDATION_ERROR`；handler 抛错返回 `ACTION_FAILED`。
- 标准返回不暴露 stack；开发环境可以 `console.error`。
- `outputSchema` 可输出，第一版不强制校验。
- `waitForIdle` 先做可扩展最小实现；优先接入项目已有 router/request/pending 信号，不默认全局 monkey patch。

## Frontend Strategy

- HAT action 表达用户意图和业务状态，不重新包装点击路径。
- 复杂 UI 组件只是到达业务状态的中间手段时，优先暴露业务动作稳定到达状态。
- 如果场景目标本身是验证组件真实交互，不能用 HAT state/action 替代真实用户路径；在 HAT 执行中应保留 manual/browser 验证。
- URL/query、seed、storage、API、项目状态管理可以作为业务状态到达策略；通用原则写入 `HAT.md`，具体页面接入教程写入 `docs/frontend-hat-friendly-guide.md`，让 agent 可解释、可回放。

## Validation

实现后尽量跑项目已有反馈环：

- 类型检查或构建。
- 已有 lint/test。
- runtime 单元测试或最小 smoke。
- 如果项目能本地启动，打开页面验证 `window.__hat.discover()`、一个 `invoke()`、`waitForIdle()`、`inspect()`。

不要为了验证临时引入完整 E2E 框架或大量外部服务配置。无法运行的验证要在完成回复中说明原因。

## Completion

最终回复保持简洁，列出：

- 新增/修改文件。
- `window.__hat` 启用条件。
- 首个 scope/action 接入摘要，以及这些具体能力是否只通过 `discover()` 暴露。
- `HAT.md`、`docs/frontend-hat-friendly-guide.md`、`AGENTS.md`、`CLAUDE.md` 状态。
- 验证命令和结果。
- 未完成或需要后续接入的范围。

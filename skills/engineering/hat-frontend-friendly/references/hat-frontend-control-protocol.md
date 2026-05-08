# HAT Frontend Control Protocol

本参考用于实现 `window.__hat`。主协议面向 Playwright、Coding Agent、QA Agent、HAT Run 等自动化执行环境，目标是把脆弱 DOM 操作提升为稳定的业务动作调用。

## 目录

- 目标
- 核心原则
- 标准接口
- Discovery
- Schema
- 注册 API
- 执行结果
- waitForIdle
- Inspect
- Agent 调用策略
- 启用条件
- 项目文档
- React/Vue/SSR 实现建议

## 目标

HAT，即 `window.__hat`，用于为自动化执行环境提供稳定、可发现、可校验的前端控制面。

它不是端到端测试框架，不替代用户路径验证。它解决的是：React、Vue 等数据驱动框架中，Agent 不应该为了设置业务状态而反复点击复杂第三方组件的内部 DOM。

典型场景：

- 表单字段值设置。
- 筛选条件应用。
- 弹窗、抽屉、面板打开关闭。
- 查询、提交、刷新。
- 读取当前业务状态以判断下一步。

## 核心原则

所有 Agent-facing 能力统一挂载到：

```ts
window.__hat
```

不要分散为 `window.__testActions`、`window.__formActions`、`window.__modalActions`。

`scope` 是注册粒度。推荐以页面、弹窗、抽屉、面板或业务模块为单位：

```text
profilePage
userCreateModal
permissionDrawer
orderFilterPanel
productSearchPage
```

scope 应绑定组件生命周期：

```ts
const unregister = hat.registerScope("profilePage", config)
unregister()
```

Modal/Drawer 打开时注册，关闭或销毁时移除。`discover()` 只返回当前真实可用的能力。

优先暴露业务语义 action：

```ts
setName({ value: "Alice" })
setCountry({ value: "CN" })
setDateRange({ start: "2026-01-01", end: "2026-01-31" })
submit({})
close({})
```

不推荐把 DOM 操作包装成协议：

```ts
click({ selector: ".ant-select" })
```

所有 action 统一接收单个 object input。不要把字符串或多个位置参数作为标准协议。

## 标准接口

最小运行时：

```ts
type HatRuntime = {
  version: string
  discover(): HatDiscovery
  invoke(scopeId: string, actionName: string, input: unknown): Promise<HatInvokeResult>
  waitForIdle(): Promise<void>
  inspect(scopeId: string): Promise<unknown>
  registerScope(scopeId: string, config: HatScopeConfig): () => void
  action(config: HatActionConfig): HatAction
  [scopeId: string]: unknown
}
```

推荐 agent 调用：

```ts
await page.evaluate(() =>
  window.__hat.invoke("profilePage", "setCountry", {
    value: "CN",
  })
)
```

便捷调试调用：

```ts
await page.evaluate(() =>
  window.__hat.profilePage.setCountry({
    value: "CN",
  })
)
```

标准协议以 `invoke` 为准。便捷 scope 方法用于 console 和调试。

## Discovery

`discover()` 输出当前页面可用能力。它应该是 agent 的第一入口。

```json
{
  "version": "1.0.0",
  "scopes": [
    {
      "id": "profilePage",
      "name": "Profile Page",
      "description": "用户资料编辑页面。用于修改姓名、邮箱、国家并提交。",
      "status": "active",
      "actions": [
        {
          "name": "setCountry",
          "description": "设置国家/地区",
          "inputSchema": {
            "type": "object",
            "properties": {
              "value": {
                "type": "string",
                "enum": ["CN", "US", "JP"],
                "description": "国家/地区代码"
              }
            },
            "required": ["value"],
            "additionalProperties": false
          },
          "examples": [
            {
              "description": "设置国家为中国",
              "input": {
                "value": "CN"
              }
            }
          ]
        }
      ]
    }
  ]
}
```

Discovery 不应暴露 secret、token、真实敏感用户数据或过大的内部状态。

## Schema

协议层采用 JSON Schema，不依赖 TypeScript 类型信息。

原因：

- TypeScript 编译后类型信息会丢失。
- 老旧项目可能没有 TypeScript。
- Agent 更适合消费结构化 schema。
- JSON Schema 可作为稳定跨语言协议。

`discover()` 应输出：

```ts
inputSchema: JSONSchema
outputSchema?: JSONSchema
```

`signature` 可以作为人类可读字段，但不应成为机器主协议。

SDK 层优先支持 Zod：

```ts
hat.action({
  description: "设置国家/地区",
  input: z.object({
    value: z.enum(["CN", "US", "JP"]).describe("国家/地区代码"),
  }),
  handler: async ({ value }) => {
    form.setFieldsValue({ country: value })
  },
})
```

SDK 内部可将 Zod schema 转成 JSON Schema 供 `discover()` 输出。

JavaScript 或老旧项目可直接注册 JSON Schema：

```ts
hat.action({
  description: "设置用户姓名",
  inputSchema: {
    type: "object",
    properties: {
      value: {
        type: "string",
        description: "用户姓名，例如 Alice",
      },
    },
    required: ["value"],
    additionalProperties: false,
  },
  handler: async ({ value }) => {
    vm.name = value
  },
})
```

## 注册 API

TypeScript/Zod 示例：

```ts
import { z } from "zod"
import { createHat } from "./hat"

const hat = createHat()

const unregister = hat.registerScope("profilePage", {
  name: "Profile Page",
  description: "用户资料编辑页面。用于修改姓名、邮箱、国家并提交。",
  actions: {
    setName: hat.action({
      description: "设置用户姓名",
      input: z.object({
        value: z.string().min(1).describe("用户姓名，例如 Alice"),
      }),
      examples: [
        {
          description: "设置姓名为 Alice",
          input: { value: "Alice" },
        },
      ],
      handler: async ({ value }) => {
        form.setFieldsValue({ name: value })
      },
    }),
    setCountry: hat.action({
      description: "设置国家/地区",
      input: z.object({
        value: z.enum(["CN", "US", "JP"]).describe("国家/地区代码"),
      }),
      examples: [
        {
          description: "设置国家为中国",
          input: { value: "CN" },
        },
      ],
      handler: async ({ value }) => {
        form.setFieldsValue({ country: value })
      },
    }),
    submit: hat.action({
      description: "提交当前表单",
      input: z.object({}),
      handler: async () => {
        await form.validateFields()
        form.submit()
      },
    }),
  },
})
```

JavaScript/JSON Schema 示例：

```ts
const unregister = hat.registerScope("profilePage", {
  name: "Profile Page",
  description: "用户资料编辑页面。用于修改姓名、邮箱、国家并提交。",
  actions: {
    setName: hat.action({
      description: "设置用户姓名",
      inputSchema: {
        type: "object",
        properties: {
          value: {
            type: "string",
            description: "用户姓名，例如 Alice",
          },
        },
        required: ["value"],
        additionalProperties: false,
      },
      examples: [
        {
          description: "设置姓名为 Alice",
          input: { value: "Alice" },
        },
      ],
      handler: async ({ value }) => {
        vm.name = value
      },
    }),
  },
})
```

注册失败策略：

- HAT 启用时，重复 scopeId、actionName 冲突、scopeId 与核心方法冲突应 fail fast。
- schema 缺失可 warning，但首次接入应补齐。
- HAT 未启用时，注册 API 可以 no-op，不挂载 `window.__hat`。

保留核心方法名：

```text
version
discover
invoke
inspect
waitForIdle
registerScope
action
```

## 执行结果

`invoke()` 返回结构化结果，不只依赖异常。

成功：

```json
{
  "ok": true,
  "data": null
}
```

失败：

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input for profilePage.setCountry",
    "issues": [
      {
        "path": ["value"],
        "message": "Expected one of: CN, US, JP"
      }
    ]
  }
}
```

推荐错误码：

```ts
type HatErrorCode =
  | "SCOPE_NOT_FOUND"
  | "ACTION_NOT_FOUND"
  | "VALIDATION_ERROR"
  | "ACTION_FAILED"
  | "TIMEOUT"
  | "NOT_READY"
```

handler 成功返回业务数据，由 runtime 包装成 `{ ok: true, data }`。handler 抛错，由 runtime 包装成 `{ ok: false, error }`。不鼓励 handler 直接返回 `HatInvokeResult`。

标准返回不暴露 stack。开发环境可以 `console.error` 原始错误。

## waitForIdle

顶层提供：

```ts
window.__hat.waitForIdle(): Promise<void>
```

第一版做可扩展最小实现，不强行识别所有框架内部队列。

可包含：

- microtask flush。
- `requestAnimationFrame`。
- Vue `nextTick`。
- router ready。
- 项目已有 request client pending tracker。
- query client idle。
- debounce/throttle flush。
- Modal/Drawer 动画完成。

调用示例：

```ts
await page.evaluate(async () => {
  await window.__hat.invoke("profilePage", "setCountry", {
    value: "CN",
  })
  await window.__hat.waitForIdle()
  await window.__hat.invoke("profilePage", "submit", {})
})
```

不默认全局 monkey patch `fetch`/axios。优先接入项目已有 request client。若必须 opt-in patch，只能在 HAT/dev/test 环境。

## Inspect

标准入口：

```ts
await window.__hat.inspect("profilePage")
```

scope 也可以暴露普通 action：

```ts
await window.__hat.invoke("profilePage", "inspect", {})
```

示例返回：

```json
{
  "form": {
    "name": "Alice",
    "email": "alice@example.com",
    "country": "CN"
  },
  "validationErrors": {},
  "dirty": true,
  "submitting": false
}
```

`inspect` 返回验收判断所需的最小业务状态，不要 dump 完整内部状态，不返回敏感信息。

## Agent 调用策略

项目 `HAT.md` 可要求 agent 执行浏览器验收时遵循：

1. 调用 `window.__hat.discover()`。
2. 若存在相关 scope/action，优先使用 HAT。
3. 无相关 HAT action 时，回退到可访问性 selector。
4. 再回退到 `data-testid` / `data-cy`。
5. 最后才使用 CSS selector 或第三方组件内部 DOM。

示例：

```ts
const discovery = await page.evaluate(() => window.__hat?.discover?.())

if (discovery?.scopes?.length) {
  await page.evaluate(() =>
    window.__hat.invoke("profilePage", "setCountry", {
      value: "CN",
    })
  )
}
```

如果场景目标本身是验证真实 UI 交互，HAT action 不能替代真实交互；应在报告中标注 manual/browser 证据需求。

## 启用条件

HAT 只应在开发、测试或 HAT 环境启用。

Vite 示例：

```ts
const enableHat =
  import.meta.env.MODE === "test" ||
  import.meta.env.MODE === "development" ||
  import.meta.env.VITE_ENABLE_HAT === "true"
```

CRA 示例：

```ts
const enableHat =
  process.env.NODE_ENV !== "production" ||
  process.env.REACT_APP_ENABLE_HAT === "true"
```

通用浏览器 guard：

```ts
if (typeof window !== "undefined" && enableHat) {
  window.__hat = hat
}
```

生产默认不挂载 `window.__hat`。

## 项目文档

`HAT.md` 写给验收 agent：

- 当前项目是否启用 `window.__hat`。
- 启用环境变量。
- Agent 调用优先级。
- 如何调用 `discover()` 发现当前页面真实可用能力。
- 如何根据 `discover()` 结果选择 `invoke(scopeId, actionName, input)`。
- 每次关键 action 后如何使用 `waitForIdle()`。
- 如何使用 `inspect(scopeId)` 判断状态。
- 当没有可用 HAT scope/action 时，如何回退到可访问性 selector、`data-testid`、CSS selector、API/seed/manual 等方式。
- 不维护具体 scope/action 清单；具体能力以运行时 `discover()` 为准，避免文档过期。

`docs/frontend-hat-friendly-guide.md` 写给 coding agent/开发者：

- 本项目 HAT runtime 目录。
- 如何新增 scope。
- 如何新增 action。
- Zod/JSON Schema 写法。
- 生命周期注册/注销。
- `waitForIdle` / `inspect` 约定。
- 复杂组件原则。
- 示例来自当前项目真实接入页面。

`AGENTS.md` 和 `CLAUDE.md` 放短入口：

```md
## Frontend HAT Friendliness

When changing frontend pages or components, consider whether the change needs a HAT-friendly control surface.

See `docs/frontend-hat-friendly-guide.md`.
```

## React/Vue/SSR 实现建议

React：

- 在 app bootstrap 中创建 runtime。
- 在组件 `useEffect` 中注册 scope，cleanup 中 unregister。
- 表单库使用其公开 API 设置值和提交。
- 不依赖 `act` 作为生产运行时 idle 机制；优先使用项目 ready/pending 信号。

Vue：

- 在 `main.ts` 或 plugin 中创建 runtime。
- 在 `onMounted` 注册，`onUnmounted` 注销。
- 可将 `nextTick` 接入 `waitForIdle`。
- 对 Element/Element Plus 等复杂组件，优先调用组件状态、form model 或业务方法。

Next：

- 只在 client component 或 client-only 入口启用。
- 不在 server component 直接 import 会访问 `window` 的模块。
- 所有 `window.__hat` 访问必须有 browser guard。

Nuxt：

- 使用 `.client.ts` plugin。
- 不在 server plugin 中挂载 HAT。

老 JavaScript 项目：

- 可直接使用 JSON Schema 注册。
- 用 JSDoc 描述核心类型。
- 不为了 HAT 改造整个构建链。

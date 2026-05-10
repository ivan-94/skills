---
name: hat-backend-friendly
description: Diagnose backend projects for HAT-friendly acceptance testing and produce a Chinese doctor-style report plus low-intrusion improvement plan. Use when the user wants to make backend services easier for agents to prepare, authenticate, call, observe, debug, isolate, cleanup, or run HAT/acceptance checks against.
---

# HAT Backend Friendly

面向后端项目做 HAT-friendly 体检。目标不是实现新框架，也不是生成 HAT 产物，而是探索当前项目，判断它是否方便 Agent 作为主要操作者完成验收：准备环境、获取鉴权、调用接口、断言状态、观察失败原因、隔离并清理数据。

默认输出中文体检报告和改造计划。保留常用英文术语，如 `health`、`traceId`、`seed`、`cleanup`、`migration`。

## 边界

- 默认只读探索，不改代码、不写文件、不启动服务、不连接数据库、不执行迁移、不创建数据。
- 默认产物只在对话中输出：HAT-friendly 体检报告 + 改造建议 + 后续 `hat-prepare` / `hat-run` 策略建议。
- 本 skill 不负责落地改造。用户要求“按建议改”时，先把本 skill 的诊断结果转成实现计划；真正改代码走普通实现流程。
- 不定义后端版 `window.__hat`，不要求项目实现统一 `/__hat/*` 或 `/test-support/*` 标准协议。
- 不生成 `HAT.md`、`guide.md`、`prepare.sh`；只指出它们应补充什么。
- 不把“能 curl 到接口”视为充分友好；还要看状态是否可判断、失败是否可归因、数据是否可隔离和清理。
- 如果项目不是后端项目，或探索后无法找到后端服务信号，停止并说明“不适用/无法判断”，不要编造建议。

## Discovery

先探索能从代码库确定的信息，不要让用户凭空提供。

### Repo 与服务识别

- 定位 repo root；读取 `README*`、`AGENTS.md`、`CLAUDE.md`、`HAT.md`、`docs/`。
- 识别后端技术栈和主服务：Node、Java、Go、Python、Ruby、PHP、Rust、.NET、Spring、Nest、Express、FastAPI、Django、Rails、Gin、Laravel 等。
- monorepo 默认选择和用户任务、默认启动入口、根 README 或部署配置最相关的主后端服务；报告中明确未覆盖的服务。
- 多个候选且信号不足时，先给候选列表和推荐对象，再询问用户指定。

### 运行与环境入口

只读检查：

- `package.json`、`pom.xml`、`build.gradle*`、`go.mod`、`pyproject.toml`、`requirements*.txt`、`Gemfile`、`composer.json`、`.csproj` 等。
- `Makefile`、`Justfile`、`Taskfile*`、`docker-compose*`、`Dockerfile*`、`Procfile`、`scripts/`、`bin/`、`ops/`、`deploy/`。
- `.env.example`、`.env.*.example`、配置目录、profile、application yaml/properties。
- migration、schema、seed、fixture、factory、test data 入口。

不要启动长期服务。不要运行 `docker compose up`、migration、seed、cleanup 或任何会改变环境的命令。

### API、Auth 与状态

只读检查：

- 路由、controller、handler、OpenAPI/Swagger、Postman/Apifox、GraphQL schema、RPC proto。
- 登录、token、session、cookie、SSO、验证码、权限、租户、测试账号相关代码和文档。
- API 响应结构、错误码、分页/过滤/排序、业务状态字段、异步任务状态、幂等键、重试语义。
- CLI 命令、后台任务、webhook、消息队列、外部服务 sandbox/mock 配置。

### 可观测与 HAT 资产

只读检查：

- logging 配置、日志路径、request id、trace id、错误处理、审计日志、job/event/outbox 表或接口。
- `health`、`ready`、`version`、`metrics`、依赖探活、服务健康矩阵。
- 已有 `HAT.md`、`hats/*/guide.md`、`hats/*/prepare.sh`、`.env.hat.example`。
- 对已有 HAT 资产评估可用性：是否说明环境、鉴权、seed、cleanup、日志、报告、run 策略。

## 诊断模型

用五维模型打等级。等级不是精确分数，而是基于证据的体检判断。

### 等级

- `A`：Agent 可基本自助完成，文档和接口清晰，失败可定位，并发风险低。
- `B`：主体可用，但有少量人工信息、脚本缺口或观察盲点。
- `C`：Agent 能尝试，但容易卡在环境、鉴权、状态断言、日志排查或数据污染。
- `D`：缺少关键入口，无法可靠自动化验收。
- `Unknown`：代码中找不到足够证据，必须明确说明缺失信息。

### 五个维度

1. **环境构建**
   - 是否有清晰的本地/测试环境启动说明。
   - 是否能检查 DB、Redis、MQ、外部依赖、schema/version、migration 状态。
   - 是否有低风险 `info` / `doctor` / `health` 命令或脚本。
   - 是否能准备验收数据，且数据来源和 cleanup 清楚。

2. **鉴权通道**
   - 是否有 dev/test/HAT 专用账号、token/cookie 获取方式或测试登录接口。
   - 是否避免验证码、SSO、真实第三方回调阻塞 Agent。
   - 是否能构造不同角色、租户、权限边界账号。
   - 是否明确生产禁用和环境开关。

3. **接口可执行**
   - 是否有可发现 API 契约：OpenAPI、路由文档、示例请求、错误码。
   - 是否能用 `curl`、CLI 或项目现有工具稳定执行。
   - 是否有合理状态表述：资源状态、业务枚举、错误结构、异步任务状态、幂等/重试结果。
   - 是否有机器可判断的 expected result，而不是只依赖前端文案或人工感觉。

4. **可观测归因**
   - 是否能用一次请求的 `traceId` / request id 关联 API、日志、后台任务、事件、外部依赖调用。
   - 错误日志是否可定位，是否有日志路径、服务名、容器名、查询方式。
   - 异步任务、MQ、webhook、outbox/inbox、定时任务是否有可查询状态。
   - 失败时 Agent 是否能判断是配置、数据、权限、依赖、业务断言还是系统异常。

5. **隔离清理**
   - 是否支持多个 Agent 并发执行 HAT，不互相污染数据。
   - 是否有 run-id、命名空间、租户、schema、临时 DB、数据前缀等隔离策略之一。
   - cleanup 是否只清理 HAT 自己创建的数据，且幂等、可预览、风险可控。
   - 共享环境、fork/attach 环境是否默认禁止破坏性写入，除非显式授权。

## 建议策略

改造建议必须低侵入、项目自然、Agent-friendly。不要把每个后端项目都推向统一框架。

### 排序方式

每条建议用收益/成本矩阵表达：

- `Agent 验收收益`：High / Medium / Low。
- `改造成本`：Low / Medium / High。
- `风险影响`：Low / Medium / High。
- `推荐顺序`：1、2、3...

优先推荐低成本高收益项，尤其是能让下一次 HAT 马上少卡住的改动。

### 输出层次

报告分两层：

- `Quick Wins`：0.5-2 天内可完成，破坏性小、代码侵入少、能改善下一次 HAT。
- `Long-term`：长期治理，如测试环境标准化、可观测体系、依赖隔离、并发验收平台化。

建议再按类型标记：

- `代码/脚本改造`：如 health/info、test login、seed、cleanup、traceId、错误结构。
- `文档/HAT.md/README 改造`：如验收入口、账号、env、日志、run 策略。
- `流程约定`：如 HAT_RUN_ID、测试数据命名、共享环境审批、生产禁用策略。

### 示例使用

可以给少量示例或伪代码帮助理解，但不要要求项目照抄。

示例方向：

```text
GET /health 或已有 health 输出中补充 DB/Redis/MQ/schema/version 状态。
```

```bash
HAT_RUN_ID=hat-20260510-153000
curl -H "X-HAT-Run-Id: $HAT_RUN_ID" "$API_URL/orders/$ORDER_ID"
```

```json
{
  "code": "PERMISSION_DENIED",
  "message": "无权限访问该资源",
  "traceId": "..."
}
```

示例只用于说明改造形态；最终建议必须贴合当前项目已有框架、命令、配置和命名。

## 安全策略

涉及测试登录、验证码绕过、权限放宽、seed、cleanup、共享环境写入、外部系统 mock、真实数据访问时，必须在建议中逐条标注：

- 仅限 dev/test/HAT 环境。
- 生产默认禁用，不能默认暴露。
- 使用显式环境开关或 profile。
- 需要审计、日志或访问限制。
- cleanup 只能删除 HAT 自己创建且可识别的数据。

不要建议为了验收方便在生产保留后门。不要把 token、cookie、DB URL、secret 写入报告。

## 与 HAT Skills 协作

### 对 `hat-prepare`

指出哪些能力应该转化为 `guide.md` 和 `prepare.sh` 信息：

- 环境模式建议：blank / fork / attach 的适配风险。
- `prepare.sh info` 应打印哪些服务、schema/version、seed、cleanup 信息。
- `.env.hat.example` 需要哪些变量。
- seed 应准备哪些角色、租户、权限、业务对象。
- cleanup 的边界和危险操作授权。

### 对 `hat-run`

指出后续执行策略：

- 哪些场景适合 API 验收。
- 哪些需要 DB 只读查询辅助断言。
- 哪些需要 log / traceId / job status 观察。
- 哪些因为鉴权、数据、外部依赖或状态不可见会 `BLOCKED`。
- 哪些只能 `MANUAL`，以及怎样改造能变成可自动化。

不要现场生成 checklist，也不要改写已有 `guide.md`。

## 报告模板

最终输出使用这个形态，保持简洁但要有证据。

```md
**HAT Backend Friendly 体检**

项目判断：后端主服务为 `<service>`，技术栈 `<stack>`。本次只读探索覆盖 `<scope>`，未覆盖 `<out-of-scope>`。

**总体结论**
- 当前等级：`B/C/...`
- 最主要阻塞：...
- 最值得先做：...

**五维评分**
| 维度 | 等级 | 证据 | 缺口 |
| --- | --- | --- | --- |
| 环境构建 | B | ... | ... |
| 鉴权通道 | C | ... | ... |
| 接口可执行 | B | ... | ... |
| 可观测归因 | C | ... | ... |
| 隔离清理 | D | ... | ... |

**Quick Wins**
| 顺序 | 建议 | 类型 | Agent 验收收益 | 改造成本 | 风险影响 |
| --- | --- | --- | --- | --- | --- |
| 1 | ... | 文档/HAT.md | High | Low | Low |

**Long-term**
- ...

**给 hat-prepare 的建议**
- ...

**给 hat-run 的建议**
- ...

**安全注意**
- ...

**需要用户补充**
- 只有在探索无法确定且影响判断时列出。
```

## 提问规则

- 先探索，后提问。
- 只问影响诊断结论或改造计划的问题。
- 不问可以从 repo 里读到的问题。
- 如果多个后端服务候选无法判断，列出候选和推荐项，请用户指定。
- 如果缺少真实环境信息，但默认只读探索已经足够给建议，不阻塞报告；在 `需要用户补充` 中列出。

## 完成回复

完成时必须说明：

- 探索覆盖了哪些后端服务和文件类型。
- 哪些结论有证据，哪些是 `Unknown`。
- 最优先的 3-5 个 Quick Wins。
- 对后续 `hat-prepare` / `hat-run` 的直接影响。
- 未做的事：没有改代码、没有启动服务、没有连接 DB、没有执行迁移或 seed。

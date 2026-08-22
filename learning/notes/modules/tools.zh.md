# tools 学习笔记

状态：草稿 | 已对照验证（2026-08-22 对照 packages/core/tools/README.zh.md、docs/tool-execution-pipeline.zh.md、packages/core/system-prompt/README.zh.md）

## 事实源（链接，不复述）

- [packages/core/tools/README.zh.md](../../../packages/core/tools/README.zh.md) — 工具注册表与执行流水线
- [docs/tool-execution-pipeline.zh.md](../../../docs/tool-execution-pipeline.zh.md) — 工具执行流水线时序图
- [packages/core/system-prompt/README.zh.md](../../../packages/core/system-prompt/README.zh.md) — 工具 schema 如何流入系统提示词

## 它是什么（用自己的话）

`tools` 是 core 七包里的「工具注册表与执行流水线」：工具插件注册 schema + 执行器，`agent-loop` 让每次工具调用依次经过 `pre-execute → guards → execute → post-execute → finalizeContent → result` 的流水线。它还决定工具如何呈现给模型（native/code/both）。它是「模型能调用哪些工具、调用后怎么执行」的机制本体。

## 关键实体（逐个链接到 home）

- `ToolRuntime`（`ctx.tools`）：注册表服务，`register`/`get`/`schemas`/`restrict`/`presentAs`/`guard`/`execute`。
- `ToolDefinition`：`ToolSchema` + `output` + `execute` + 可选 `finalizeContent`/`presentCall`/`presentResult`/`timeoutMs`/`isConcurrencySafe`。
- 三个 waterfall：`tools/pre-execute`（允许/拒绝/询问）、`tools/execute`（环绕分发）、`tools/post-execute`（结果处理）。
- `ToolExecutionResult`：`{ isError, value/content/meta/additionalContexts }` 的判别标记结果。

## 核心重点一：工具执行流水线（README 第 5 行）

每次工具调用依次经过六个环节，权限递进清晰：

| 环节 | 是什么 | 能做什么 |
|---|---|---|
| `tools/pre-execute` | 可重排的允许/拒绝/询问门禁 | 决定放行/拒绝/询问审批 |
| `ctx.tools.guard()` | 单调守卫（pre 之后） | 只返回理由拒绝或 `undefined` 放行；**不可把拒绝改回允许** |
| `tools/execute` | 环绕分发包装层 | 超时/重试/指标；只能替换 `signal` |
| `tools/post-execute` | 结果处理 | 替换内容/替换值/阻止/附加上下文 |
| `finalizeContent` | 定义持有的最终内容不变式 | 只能替换 `content`，同步、全输入有定义 |
| `tools/result` | 仅观测通知 | 只读，不可改 |

三个 waterfall 的权限递进：**pre-execute 决定「能不能执行」、execute 环绕「怎么执行」、post-execute 决定「结果怎么样」**，guard 是夹在中间的「单调拒绝点」。

## 核心重点二：`tools/result` ≠ `tool/result`（README 第 39 行）

极容易看错（差一个字母），但语义完全不同：

| | `tools/result`（复数） | `tool/result`（单数） |
|---|---|---|
| 是什么 | **实时事件**（注册表通知） | **持久会话事件**（落日志） |
| 谁发 | `ToolRuntime`（流水线末尾） | `agent-loop`（拿到结果后 `session.append`） |
| 进日志吗 | 不 | **进**（surface 三类消息之一） |
| 谁消费 | 实时观察者（策略、UI） | 模型（`deriveMessages` 投影）+ 回放 |

## 核心重点三：工具作用域的三层组合（比 persona 更丰富）

`agent.ctx` 对工具能做**三种**操作（README 第 20–23 行），而 persona 只有「遮蔽」一种：

| 操作 | API | 作用 |
|---|---|---|
| 过滤 | `restrict(filter)` | 对全局工具应用 allow/deny 掩码 |
| 遮蔽 | `register`（同名） | agent 本地注册同名工具，遮蔽全局 |
| 新增 | `register`（新名） | 注册只属于该 agent 的新工具 |

**组合顺序**：先过滤全局 → 再遮蔽同名 → 再叠加本地新工具（README 第 22 行 + 第 137 行「限制、遮蔽和扩展注册会改变该 agent 的最终工具集合」）。

## 我曾经的误解（原以为 → 实际是 → 修正来源）——本笔记的黄金内容

1. **原以为** 工具的执行「决定能不能跑」和「跑完结果怎样」是同一道关卡；**实际是** 分属三个权限递进的 waterfall（pre/execute/post）+ 一个单调 guard + 一个仅观测 result。修正来源：README 第 5 行 + tool-execution-pipeline.zh.md。

2. **原以为** `tools/result` 和 `tool/result` 是同一事件的两种写法；**实际是** 一个是实时事件（不落日志）、一个是持久会话事件（surface 三类之一），差了整整一个「落日志」的维度。修正来源：README 第 39 行。

3. **原以为** agent 作用域对工具的机制和 persona 一样（只有遮蔽）；**实际是** 工具有「过滤（restrict）+ 遮蔽（register 同名）+ 新增（register 新名）」三种，组合顺序是「先过滤 → 再遮蔽 → 再叠加」。修正来源：README 第 20–23 行。

4. **原以为** 工具 schema 和系统提示词是两路独立输入；**实际是** 工具 schema 通过 `ctx.systemPrompt.tools()` 自动流入系统提示词组装，是 `EpochHeader.tools` 的来源。修正来源：README 第 31 行 + system-prompt README 第 37 行。

## 与相邻单元的关系（依赖谁 / 被谁依赖）

- **依赖**：`scope`（作用域化注册/过滤）、`system-prompt`（`ctx.systemPrompt.tools()` 自动贡献 schema）。
- **被谁依赖**：`agent-loop`（`ctx.tools.execute()` 分发工具调用）；工具插件（`ctx.tools.register()`）。
- **与 session 的关系**：`tool/result` 是 surface 三类消息之一，落日志、进模型历史。

## 设计红线

- **作用域是可见性组合，不是权限边界**（README 第 22 行末尾）——同进程插件仍可直接调用服务。
- **取消是协作式**（README 第 35 行）：工具必须观测 `exec.signal`，只有 `tools/execute` 包装层可替换信号。

## 验证方式

- 运行时级：llm-inspector 实验里 `options.tools` 有 25 个 schema，就是 tools 注册表经 `ctx.systemPrompt.tools()` → `EpochHeader.tools` 的产物。
- 源码级：`tools/result` vs `tool/result` 的区分见 README 第 39 行。

## 遗留问题（登记进 questions.zh.md）

- `restrict()` 的 allow/deny 掩码「快照」语义（注册时快照 vs 实时）——见 system-prompt.zh.md 遗留问题（同一疑问的 tools 侧）。

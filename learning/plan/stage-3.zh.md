# 阶段 3（核心 spine 与回合流）执行路线与进度

本文是阶段 3 的**执行路线 + 逐步勾选进度**：把 [learning-path.zh.md](../learning-path.zh.md) 阶段 3 的「精读材料 + 动手任务 + 过关检验」拆成可逐步推进的小步骤，并标出每步的验证点与学习区落盘动作。事实源仍是 learning-path.zh.md，本文不重复其内容、只做执行拆解；冲突以 learning-path.zh.md 为准。

过关标准（来自 learning-path.zh.md 完成标志表阶段 3 行）：① 通过三项前置检查（事实源 / 可重建 / 新输入）；② 能按依赖序 `scope → session → system-prompt → tools → agent → agent-default-model → agent-loop` 说出每包职责与 ctx key（scope 无 key，说明原因）；③ 能对照 Turn flow 文本图，把一次真实或 replay 的 turn 从 `turn/start` 追到 `turn/end`，并区分持久事件与存活扩展点。

## 路线总览（三步，由全貌到逐包再到逐事件）

```
第 1 步  读架构全貌 ── architecture.zh.md + subsystems/core.zh.md 建立 spine 骨架心智模型
第 2 步  逐包精读 ── 按依赖序读 core 七包 README，落实「每包职责 + ctx key」
第 3 步  逐事件追踪（动手任务）── 对照 Turn flow 文本图追一次 turn，通过三项前置检查
```

## 第 1 步：读架构全貌

建立阶段 3 的入口锚点，先整体后细节。事实源顺序与 learning-path 阶段 3「精读材料」1–3 一致。

- [x] [architecture.zh.md](../../docs/architecture.zh.md) 全文精读——改 `packages/` 之前的必读文档（根 AGENTS.md 首段要求）
- [x] 重点锁定「Session log」一节，它是三项前置检查的出处
- [x] [subsystems/core.zh.md](../../docs/subsystems/core.zh.md)——Agent 句柄、投递/拦截契约、逐包回路图
- [x] [agent-lifecycle.zh.md](../../docs/agent-lifecycle.zh.md) 与 [tool-execution-pipeline.zh.md](../../docs/tool-execution-pipeline.zh.md)——回合时序图与工具管道

## 第 2 步：逐包精读（按依赖序）

依赖序（事实源 [packages/core/README.zh.md](../../packages/core/README.zh.md)）：

```
scope → session → system-prompt → tools → agent → agent-default-model → agent-loop
```

排序理由一句话导航（learning-path 阶段 3 原文）：`scope` 是被其余各包共享的注册原语；`session` 的事件日志是全系统事实源；`system-prompt` 与 `tools` 从日志与注册表组装模型请求的输入；`agent` 拥有公共接口与事件词汇，`agent-default-model` 是其入口共享的部署级默认模型选择；`agent-loop` 只是该接口的默认具体驱动，扩展插件依赖接口而非驱动。

每包读完应能答出两问：**职责**（一句话）+ **ctx key**（`scope` 无 key，需说明原因）。这是过关标准 ②。

| 序 | 包 | 职责（读完填） | ctx key（读完填） | 状态 |
|---|---|---|---|---|
| 1 | [scope](../../packages/core/scope/README.zh.md) | 带作用域的注册原语：`createScope` 造带标签子上下文，隔离各 agent 的注册 | 无 key（原因：零依赖函数库，非 `Service`，不挂 ctx 键；全局不是 scope） | [x] |
| 2 | [session](../../packages/core/session/README.zh.md) | 事件溯源会话日志 + 内存存储；`Session` 仅追加真源，surface 层筛 3 类消息事件，`deriveMessages()` 投影模型历史 | `sessions`（服务 `SessionStore`） | [x] |
| 3 | [system-prompt](../../packages/core/system-prompt/README.zh.md) | 系统提示词组装注册表：插件贡献有序段/工具 schema/具名变量，loop 每步 assemble+renderPrompt 渲染完整提示词 | `systemPrompt`（服务 `SystemPrompt`） | [x] |
| 4 | [tools](../../packages/core/tools/README.zh.md) | 工具注册表与执行流水线：pre-execute → guards → execute → post-execute → finalizeContent → result | `tools`（服务 `ToolRuntime`） | [x] |
| 5 | [agent](../../packages/core/agent/README.zh.md) | Agent 接口 + 注册表 + 发起方作用域 + `agent/*` 事件词汇；定义抽象契约不依赖 loop | `agents`（服务 `AgentRegistry`） | [x] |
| 6 | [agent-default-model](../../packages/core/agent-default-model/README.zh.md) | 部署级默认模型选择服务，供入口创建无会话级模型选择的 Agent 时取默认值 | `agentDefaultModel`（服务 `AgentDefaultModelConfig`） | [x] |
| 7 | [agent-loop](../../packages/core/agent-loop/README.zh.md) | 唯一具体循环实现：实现 `Agent` 接口，驱动 session/turn/step 生命周期 | `agentLoop`（服务 `AgentLoop`） | [x] |

> 边界辨析（不改变七包依赖序，只是提醒读时留意三处不对称）：
>
> 1. `packages/core/` 下还有一个 [agent-tool-presentation](../../packages/core/agent-tool-presentation/README.zh.md)，learning-path 的「七包」未把它计入 spine 依赖序。读 README 时留意它相对 spine 链的位置（是 spine 成员还是旁支）。
> 2. architecture.zh.md「核心包」表列了 7 行，但与 learning-path 阶段 3 的七包**对称地一进一出**：architecture 表有 [llm/llm](../../packages/llm/llm/README.zh.md)（`ctx.llm`，消息/流词汇 + 适配器缝）而没有 `agent-default-model`；learning-path 依赖序有 `agent-default-model` 而没有 `llm/llm`。
>    - `llm/llm` 是**能力层的缝**（L2），它的完整三角色拆分（Service Definition / Provider / Consumer）是阶段 4 的核心内容，本阶段只按 `agent/request → llm/stream → assistant/chunk*` 的链路认识 `ctx.llm` 这个 ctx 键即可，不拆它的缝。
>    - `agent-default-model` 进了 spine 依赖序却**不在** architecture 核心包表里，这是本阶段更值得自答的一处不对称（读包 README 时留意它为何算 spine 成员）。


## 第 3 步：逐事件追踪（动手任务）

在一段 replay 的会话日志（或一次真实 turn 的日志）里，对照 architecture.zh.md 的 Turn flow 文本图，逐事件追踪 `turn/start` → `turn/end`，标出哪些是**持久会话事件**、哪些是**存活扩展点**（live extension point，只存在于进程内、不落日志）。

可用素材：无 key 环境下，用阶段 1/阶段 0 已有的日志锚点，或 `examples/headless-agent/tests/snapshots/headless-profile/session.expected.jsonl`（keyless 快照期望日志，占位符化、可读）。

- [x] 拿到一份可逐事件对照的日志（`session.expected.jsonl`，33 行）
- [x] 从 `turn/start` 追到 `turn/end`，标出持久事件与扩展点（见 [experiments/003-turn-trace.zh.md](../experiments/003-turn-trace.zh.md)）
- [x] 依次过三项前置检查（见下）

### 三项前置检查（Model-visible ⟺ logged）

出自根 AGENTS.md 同名约定与 architecture.zh.md「Session log」一节。三项全部通过前，不要改动任何模型可见行为；改动模型可见面而不满足第 3 项，是本仓库明确禁止并设有运行时不变量断言的错误类别。

- [x] ① **事实源**：能用自己的话说出「会话日志是模型所见上下文的事实源，`deriveMessages()` 从日志投影模型历史，原始 `assistant/chunk` 事件保重放与 UI 保真」
- [x] ② **可重建**：能用自己的话说出「任何到达模型请求的内容必须可从会话日志重建；这一点由运行时不变量断言，不是口头约定」
- [x] ③ **新输入**：能用自己的话说出「新增一个模型可见输入，必须新增一个会话事件：扩展 `SessionEventMap` 并从日志渲染」，并能在 `SessionEventMap` 里指出最近一次这样做的先例（日志先例：`session/title-llm-request`、`request/header` 均为「新输入 → 新事件」的活例子）

## 已完成的落盘产出

（每轮学习结束后，按 [method.zh.md](../method.zh.md)「落盘约定」由读者裁决是否记录；记录后在此登记链接）

journal：

- [2026-08-22-01-stage3-log-event-flips.zh.md](../journal/2026-08-22-01-stage3-log-event-flips.md)：阶段 3 收尾——日志/事件概念的三次认知翻转

notes：

- `notes/modules/`：scope / session / system-prompt / tools / agent / agent-default-model / agent-loop 七包笔记
- [notes/mechanisms/log.zh.md](../notes/mechanisms/log.zh.md)：横切主线「日志」（含术语澄清、两套重建机制、日志数据流图）
- [notes/mechanisms/event-persistence.zh.md](../notes/mechanisms/event-persistence.zh.md)：横切机制「事件持久性」（持久 vs 扩展点的区分准则 + 回合流图 + 源码位置）

experiments：

- [experiments/002-llm-inspector.zh.md](../experiments/002-llm-inspector.zh.md)：插件验证（llm-inspector 实时观察器）
- [experiments/003-turn-trace.zh.md](../experiments/003-turn-trace.zh.md)：逐事件追踪 session.expected.jsonl

## 过关检验自测（完成时逐条打勾）

- [x] ① 通过三项前置检查（事实源 / 可重建 / 新输入）
- [x] ② 能按依赖序 `scope → session → system-prompt → tools → agent → agent-default-model → agent-loop` 说出每包职责与 ctx key（scope 无 key，说明原因）
- [x] ③ 能对照 Turn flow 文本图追一次 turn 从 `turn/start` 到 `turn/end`，并区分持久事件与存活扩展点
